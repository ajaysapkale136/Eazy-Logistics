# train_categorizer.py
import os
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib
from collections import Counter

ROOT = os.path.dirname(__file__)
DATA = os.path.join(ROOT, "data", "categories_seed.csv")
MODEL_DIR = os.path.join(ROOT, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

df = pd.read_csv(DATA)
df['text'] = df['text'].fillna('').astype(str)
df['label'] = df['label'].astype(str).str.strip()

X = df['text']
y = df['label']

# Check label counts
label_counts = Counter(y)
print("Label counts:")
for label, cnt in label_counts.items():
    print(f"  {label}: {cnt}")

# Decide whether to stratify based on counts
min_count = min(label_counts.values()) if label_counts else 0
use_stratify = min_count >= 2 and len(label_counts) > 1

if not use_stratify:
    print("\nWARNING: Some classes have fewer than 2 samples; "
          "falling back to non-stratified split. Add more labeled examples for reliable results.\n")

# If dataset is extremely small, avoid test split too large
test_size = 0.15
if len(df) < 10:
    # for small datasets, use a slightly larger train fraction to allow fitting
    test_size = 0.2 if len(df) >= 5 else 0.0
    print(f"Small dataset detected ({len(df)} rows). Using test_size={test_size}.")

if test_size == 0.0:
    # no test split: train on all data (not ideal, but avoids errors)
    X_train, X_test, y_train, y_test = X, X, y, y
else:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y if use_stratify else None
    )

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1,2), max_features=20000)),
    ("clf", LogisticRegression(max_iter=2000))
])

pipeline.fit(X_train, y_train)

if test_size != 0.0 and len(X_test) > 0:
    y_pred = pipeline.predict(X_test)
    print("\nClassification report on test set:")
    print(classification_report(y_test, y_pred))
else:
    print("\nNote: no held-out test set was used (small dataset).")

model_path = os.path.join(MODEL_DIR, "pipeline.joblib")
joblib.dump(pipeline, model_path)
print("Saved pipeline to:", model_path)
