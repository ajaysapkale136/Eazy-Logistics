from flask import Flask, request, jsonify
from categorizer import predict_category

app = Flask(__name__)

@app.route("/")
def home():
    return "AI Categorizer API is running"

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True) or {}

    title = str(data.get("title") or "").strip()
    description = str(data.get("description") or "").strip()
    text = str(data.get("text") or "").strip()

    if text and (not title and not description):
        title = text

    combined = f"{title} {description}".strip()
    if not combined:
        return jsonify({"error": "Missing title/description/text"}), 400

    category = predict_category(title, description)
    return jsonify({"category": category, "confidence": 1.0})

if __name__ == "__main__":
    app.run(debug=False)

