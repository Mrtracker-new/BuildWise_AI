import os
import logging
import numpy as np
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

# ADE20K dataset class mappings for SegFormer:
# Class 4: tree
# ADE20K dataset class mappings for SegFormer:
# Classes representing tree, palm, plant, grass, field
ADE20K_TREE_CLASSES = {4, 9, 17, 29, 72}
# Classes 21 (water), 26 (sea), 60 (river), 113 (waterfall), 128 (lake)
ADE20K_WATER_CLASSES = {21, 26, 60, 113, 128}

MODEL_ID: str = "nvidia/segformer-b0-finetuned-ade-512-512"
MODEL_REVISION: str = "main"

class DegradedVisionError(Exception):
    """Raised when deep learning segmentation fails or is disabled; triggers fallback to index-only mode."""
    pass

class SegFormerAdapter:
    """
    Singleton CPU SegFormer-B0 ADE20K segmentation adapter.
    Encapsulates tensor preparation, bilinear 24x24 -> 512x512 upscaling, forward pass,
    and nearest-neighbor 512x512 -> 24x24 downsampling.
    """
    def __init__(self):
        self._model = None
        self._initialized = False

    def initialize(self) -> None:
        if self._initialized:
            return

        if os.getenv("SATELLITE_VISION_MODEL", "on").lower() in ("off", "false", "0", "disable"):
            raise DegradedVisionError("SegFormer deep learning model explicitly disabled via SATELLITE_VISION_MODEL=off")

        try:
            import torch
            from transformers import SegformerForSemanticSegmentation

            # Cap CPU inference threads to prevent latency spikes or core starvation
            torch.set_num_threads(2)

            cache_dir = os.getenv("HUGGINGFACE_HUB_CACHE") or os.getenv("HF_HOME")

            logger.info("Loading SegFormer-B0 model checkpoint %s (CPU 2-threads)...", MODEL_ID)
            self._model = SegformerForSemanticSegmentation.from_pretrained(
                MODEL_ID,
                revision=MODEL_REVISION,
                cache_dir=cache_dir
            )
            self._model.eval()
            self._initialized = True
            logger.info("SegFormer-B0 loaded successfully.")
        except Exception as exc:
            logger.warning("SegFormer-B0 initialization failed (%s); falling back to index-only mode.", exc)
            raise DegradedVisionError(f"SegFormer model could not be initialized: {exc}") from exc

    def predict_classes(
        self,
        b04_red: np.ndarray,
        b03_green: np.ndarray,
        b02_blue: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Executes semantic segmentation inference on RGB bands:
        1. Formats RGB array into (H, W, 3) with percentile contrast stretch.
        2. Bilinearly upscales from 24x24 to 512x512 tensor (Amendment 2).
        3. Runs SegFormer inference under torch.no_grad().
        4. Nearest-neighbor downsamples 512x512 class mask back to original 24x24 resolution (Amendment 2).
        Returns:
            seg_tree_mask: np.ndarray (bool, shape 24x24)
            seg_water_mask: np.ndarray (bool, shape 24x24)
        """
        if not self._initialized:
            self.initialize()

        try:
            import torch
            import torch.nn.functional as F

            orig_h, orig_w = b04_red.shape

            # 1. Prepare RGB stack normalized with percentile contrast stretch
            r = b04_red.astype(np.float32)
            g = b03_green.astype(np.float32)
            b = b02_blue.astype(np.float32)

            p2, p98 = np.percentile(np.stack([r, g, b]), (2, 98))
            p_denom = max(float(p98 - p2), 500.0)
            r_norm = np.clip((r - p2) / p_denom, 0.0, 1.0)
            g_norm = np.clip((g - p2) / p_denom, 0.0, 1.0)
            b_norm = np.clip((b - p2) / p_denom, 0.0, 1.0)

            # Stack to (1, 3, H, W)
            rgb_tensor = torch.from_numpy(np.stack([r_norm, g_norm, b_norm], axis=0)).unsqueeze(0).float()

            # 2. Amendment 2: Bilinear interpolation upscaling from (24, 24) to (512, 512)
            input_512 = F.interpolate(rgb_tensor, size=(512, 512), mode="bilinear", align_corners=False)

            # ImageNet normalization expected by pretrained vision encoders
            mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
            std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
            input_norm = (input_512 - mean) / std

            # 3. Model forward pass on CPU capped at 2 threads
            torch.set_num_threads(2)
            with torch.no_grad():
                outputs = self._model(pixel_values=input_norm)
                logits = outputs.logits # (1, 150, 128, 128)
                upsampled_logits = F.interpolate(logits, size=(512, 512), mode="bilinear", align_corners=False)
                pred_classes_512 = upsampled_logits.argmax(dim=1) # (1, 512, 512)

            # 4. Amendment 2: Downsample 512x512 class mask back to (orig_h, orig_w) e.g. 24x24
            # Nearest neighbor interpolation preserves discrete integer class IDs
            pred_classes_tensor = pred_classes_512.unsqueeze(1).float() # (1, 1, 512, 512)
            pred_classes_orig = F.interpolate(
                pred_classes_tensor,
                size=(orig_h, orig_w),
                mode="nearest"
            )[0, 0].cpu().numpy().astype(int)

            # 5. Extract boolean masks for ADE20K tree and water categories
            seg_tree_mask = np.isin(pred_classes_orig, list(ADE20K_TREE_CLASSES))
            seg_water_mask = np.isin(pred_classes_orig, list(ADE20K_WATER_CLASSES))

            return seg_tree_mask, seg_water_mask

        except DegradedVisionError:
            raise
        except Exception as exc:
            logger.warning("SegFormer inference failed (%s); degrading to index-only mode.", exc)
            raise DegradedVisionError(f"SegFormer inference failed: {exc}") from exc


# Process singleton instance
_SEGFORMER_ADAPTER: Optional[SegFormerAdapter] = None

def get_segformer_adapter() -> SegFormerAdapter:
    """Returns process-level lazy singleton SegFormer adapter."""
    global _SEGFORMER_ADAPTER
    if _SEGFORMER_ADAPTER is None:
        _SEGFORMER_ADAPTER = SegFormerAdapter()
    return _SEGFORMER_ADAPTER
