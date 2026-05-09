from flask import Flask, request, jsonify
import os, joblib
from flask_cors import CORS

ROOT = os.path.dirname(__file__)
MODEL_PATH = os.path.join(ROOT, "models", "pipeline.joblib")
app = Flask(__name__)
CORS(app)

if not os.path.exists(MODEL_PATH):
    raise RuntimeError("Model not found. Run train_categorizer.py first.")

pipeline = joblib.load(MODEL_PATH)

@app.route("/")
def home():
    return "AI Categorizer API is running", 200

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True)
    text = data.get("text", "")
    if not isinstance(text, str) or text.strip() == "":
        return jsonify({"error": "Missing text"}), 400
    try:
        probs = pipeline.predict_proba([text])[0] if hasattr(pipeline, "predict_proba") else None
        pred = pipeline.predict([text])[0]
        confidence = float(max(probs)) if probs is not None else 1.0
        return jsonify({"category": pred, "confidence": confidence})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
