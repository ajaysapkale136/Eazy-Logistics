def _add_score(scores: dict, category: str, value: float):
    scores[category] = scores.get(category, 0.0) + value


def predict_category(title: str, description: str):
    title = (title or "").lower().strip()
    description = (description or "").lower().strip()
    text = f"{title} {description}".strip()

    if not text:
        return "Trending"

    scores = {}

    keyword_map = {
        "Mountain": [
            "mountain", "hill", "peak", "range", "valley", "cliff", "himalaya", "ghat"
        ],
        "Rooms": [
            "room", "bedroom", "single room", "double room", "guest room", "suite", "private room"
        ],
        "Iconic Citys": [
            "city", "urban", "metro", "downtown", "center", "centre", "skyline", "business district"
        ],
        "Castles": [
            "castle", "fort", "palace", "king", "queen", "heritage", "royal", "haveli"
        ],
        "Amazing Pools": [
            "pool", "beach", "ocean", "swim", "waterfront", "sea view", "infinity pool"
        ],
        "Camping": [
            "camp", "camping", "tent", "forest", "campfire", "bonfire", "glamping"
        ],
        "Farms": [
            "farm", "village", "tractor", "agriculture", "farmland", "farmhouse", "farmstay"
        ],
        "Arctic": [
            "snow", "ice", "arctic", "cold", "glacier", "frozen", "snowfall"
        ],
        "Domes": [
            "dome", "igloo", "geodesic", "bubble house", "pod stay"
        ],
        "Boats": [
            "boat", "ship", "yacht", "cruise", "houseboat", "sailing", "sailboat"
        ],
        "Trending": [
            "modern", "luxury", "popular", "trending", "stylish", "featured", "premium", "best", "amazing"
        ],
    }

    # Heavier weight for title terms because they are usually category-defining.
    for category, words in keyword_map.items():
        for w in words:
            if w in title:
                _add_score(scores, category, 2.0)
            if w in description:
                _add_score(scores, category, 1.0)

    if not scores:
        return "Trending"

    # Prefer specific categories over generic Trending when scores are close.
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_category, top_score = sorted_scores[0]

    if top_category == "Trending" and len(sorted_scores) > 1:
        second_category, second_score = sorted_scores[1]
        if second_score >= top_score * 0.75:
            return second_category

    return top_category
