import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, confusion_matrix

print("=" * 60)
print("GST Fraud Detection Model Training (Isolation Forest)")
print("=" * 60)

FEATURE_COLUMNS = [
    "invoiceCount",
    "totalTaxableValue",
    "itcRatio",
    "lateFilingsCount",
    "missingEwayRatio",
    "gstPaidVsCollectedRatio",
    "degreeCentrality",
    "outDegree",
    "inDegree",
    "cycleParticipation",
    "avgNeighborRisk",
]


def generate_synthetic_dataset(n_samples=1500, seed=42):
    np.random.seed(seed)

    data = pd.DataFrame({
        "invoiceCount": np.random.randint(5, 220, n_samples),
        "totalTaxableValue": np.random.uniform(75_000, 12_000_000, n_samples),
        "itcRatio": np.random.uniform(0.2, 1.0, n_samples),
        "lateFilingsCount": np.random.randint(0, 12, n_samples),
        "missingEwayRatio": np.random.uniform(0.0, 0.7, n_samples),
        "gstPaidVsCollectedRatio": np.random.uniform(0.3, 1.2, n_samples),
        "degreeCentrality": np.random.randint(0, 40, n_samples),
        "outDegree": np.random.randint(0, 30, n_samples),
        "inDegree": np.random.randint(0, 30, n_samples),
        "cycleParticipation": np.random.choice([0, 1], n_samples, p=[0.86, 0.14]),
        "avgNeighborRisk": np.random.uniform(0.0, 1.0, n_samples),
    })

    # Synthetic label used only for offline quality inspection.
    fraud_mask = (
        (data["itcRatio"] > 0.82)
        | (data["missingEwayRatio"] > 0.35)
        | (data["cycleParticipation"] == 1)
        | (data["avgNeighborRisk"] > 0.65)
    )
    data["label"] = fraud_mask.astype(int)
    return data


def load_dataset():
    csv_path = "taxpayer_features.csv"
    if os.path.exists(csv_path):
        incoming = pd.read_csv(csv_path)
        missing = [f for f in FEATURE_COLUMNS if f not in incoming.columns]
        if not missing:
            print(f"\n✓ Dataset loaded from {csv_path}: {incoming.shape[0]} samples")
            return incoming
        print(f"\n⚠ {csv_path} missing required columns ({', '.join(missing)}). Using synthetic dataset.")

    data = generate_synthetic_dataset()
    print(f"\n✓ Synthetic dataset created: {data.shape[0]} samples")
    return data


data = load_dataset()
X = data[FEATURE_COLUMNS].astype(float)
y = data["label"].astype(int) if "label" in data.columns else None

print(f"\n✓ Feature matrix: {X.shape}")
if y is not None:
    fraud_count = int(y.sum())
    print(f"✓ Label distribution -> Fraud: {fraud_count}, Normal: {len(y) - fraud_count}")

print("\n" + "=" * 60)
print("MODEL TRAINING")
print("=" * 60)

model = IsolationForest(
    n_estimators=300,
    contamination=0.15,
    random_state=42,
    n_jobs=-1,
)

print("\n🔄 Training Isolation Forest...")
model.fit(X)
print("✓ Training complete!")

print("\n" + "=" * 60)
print("MODEL EVALUATION")
print("=" * 60)

pred = model.predict(X)
pred_fraud = (pred == -1).astype(int)
raw_score = -model.decision_function(X)
score_min = float(raw_score.min())
score_max = float(raw_score.max())
score_norm = (raw_score - score_min) / (score_max - score_min + 1e-12)

print(f"\n✓ Predicted anomalies: {int(pred_fraud.sum())} ({(pred_fraud.mean() * 100):.2f}%)")
print(f"✓ Normalized score range: {float(score_norm.min()):.4f} to {float(score_norm.max()):.4f}")

if y is not None:
    print("\n📈 Classification Report (label used only for diagnostics):")
    print(classification_report(y, pred_fraud, target_names=["Normal", "Fraud"]))
    print("\n📊 Confusion Matrix:")
    print(confusion_matrix(y, pred_fraud))

joblib.dump(model, "fraud_model.pkl")
print("\n" + "=" * 60)
print("✓ Model saved as 'fraud_model.pkl'")
print("=" * 60)
print("\n🎉 Isolation Forest training complete. Model ready for deployment.")
print("=" * 60)