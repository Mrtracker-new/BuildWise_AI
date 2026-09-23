import urllib.request
import json
import time

def test_location(name, lat, lon):
    print(f"\n==========================================")
    print(f"Testing {name} ({lat}, {lon})")
    print(f"==========================================")
    t0 = time.time()
    payload = json.dumps({
        "latitude": lat,
        "longitude": lon,
        "plot_area_sqft": 2000
    }).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/site-vision",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
    elapsed = time.time() - t0
    
    print(f"Latency: {elapsed:.2f}s")
    print(f"Mode: {res.get('mode')}")
    print(f"Green Cover: {res.get('green_cover_pct'):.1f}%")
    print(f"Water Cover: {res.get('water_cover_pct'):.1f}%")
    print(f"Built-up: {res.get('built_up_pct'):.1f}%")
    print(f"Tree Clusters: {len(res.get('tree_clusters', {}).get('features', []))}")
    print(f"Water Bodies: {len(res.get('water_bodies', {}).get('features', []))}")
    print(f"Preservation Plan Items: {len(res.get('preservation_plan', []))}")
    if res.get('preservation_plan'):
        for item in res['preservation_plan'][:3]:
            print(f"  - Cluster {item['cluster_id']}: Rank {item['rank'].upper()}, Area {item['area_sqm']}m², NDVI {item['mean_ndvi']:.2f}")
    return res

if __name__ == "__main__":
    # Demo 1: High Canopy / Uttara Kannada Forest
    r1 = test_location("Uttara Kannada Forest", 14.8000, 74.6000)
    assert r1["green_cover_pct"] >= 40.0, f"Expected Uttara Kannada green cover >= 40%, got {r1['green_cover_pct']}"
    assert len(r1["preservation_plan"]) > 0, "Expected preservation items in forest"
    print("DEMO 1 (Uttara Kannada Forest): PASSED")

    # Demo 2: Low Canopy / Urban Bengaluru Core
    r2 = test_location("Bengaluru Urban Core", 12.9716, 77.5946)
    assert r2["green_cover_pct"] < 15.0, f"Expected Bengaluru Core green cover < 15%, got {r2['green_cover_pct']}"
    print("DEMO 2 (Bengaluru Urban Core): PASSED")

    # Demo 3: Water Body Detection / Ulsoor Lake
    r3 = test_location("Ulsoor Lake", 12.9822, 77.6200)
    assert r3["water_cover_pct"] > 0.0 or len(r3["water_bodies"]["features"]) > 0, f"Expected water detected at Ulsoor Lake"
    print("DEMO 3 (Ulsoor Lake): PASSED")

    # Demo 4: Offline / Invalid Location Graceful Degradation
    r4 = test_location("Ocean Off Coast (No Land / Fallback Handling)", -10.0, -10.0)
    assert r4["mode"] in ("unavailable", "index-only", "segformer"), f"Unexpected mode {r4['mode']}"
    print("DEMO 4 (Offline / Degraded Fallback Handling): PASSED")

    print("\nALL 4 ACCEPTANCE DEMOS SUCCESSFULLY VERIFIED!")
