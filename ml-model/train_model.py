import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import joblib

print("=" * 60)
print("GST Fraud Detection Model Training")
print("=" * 60)

# Load dataset with graph features
try:
    data = pd.read_csv("taxpayer_features.csv")
    print(f"\n✓ Dataset loaded: {data.shape[0]} samples, {data.shape[1]} features")
except FileNotFoundError:
    print("\n⚠ taxpayer_features.csv not found. Creating sample dataset...")
    # Create sample dataset with all features
    np.random.seed(42)
    n_samples = 1000
    
    data = pd.DataFrame({
        # Financial features
        'invoice_count': np.random.randint(10, 200, n_samples),
        'total_taxable_value': np.random.uniform(100000, 10000000, n_samples),
        'itc_ratio': np.random.uniform(0.2, 0.95, n_samples),
        'late_filings_count': np.random.randint(0, 10, n_samples),
        'missing_eway_ratio': np.random.uniform(0, 0.6, n_samples),
        'gst_paid_vs_collected_ratio': np.random.uniform(0.3, 1.2, n_samples),
        
        # Graph features
        'degree_centrality': np.random.randint(0, 30, n_samples),
        'out_degree': np.random.randint(0, 25, n_samples),
        'cycle_participation': np.random.choice([0, 1], n_samples, p=[0.85, 0.15]),
        'cluster_size': np.random.randint(0, 20, n_samples),
        'avg_neighbor_risk': np.random.uniform(0, 1, n_samples),
        
        # Label (fraud or not)
        'label': np.random.choice([0, 1], n_samples, p=[0.7, 0.3]),
    })
    
    # Make fraudulent cases more suspicious
    fraud_mask = data['label'] == 1
    data.loc[fraud_mask, 'itc_ratio'] = np.random.uniform(0.8, 0.95, fraud_mask.sum())
    data.loc[fraud_mask, 'missing_eway_ratio'] = np.random.uniform(0.3, 0.6, fraud_mask.sum())
    data.loc[fraud_mask, 'cycle_participation'] = np.random.choice([0, 1], fraud_mask.sum(), p=[0.3, 0.7])
    data.loc[fraud_mask, 'avg_neighbor_risk'] = np.random.uniform(0.6, 1, fraud_mask.sum())
    
    data.to_csv("taxpayer_features.csv", index=False)
    print(f"✓ Sample dataset created and saved")

# Display feature information
print("\n" + "=" * 60)
print("FEATURE SET")
print("=" * 60)

feature_columns = [col for col in data.columns if col not in ['gstin', 'label']]
financial_features = ['invoice_count', 'total_taxable_value', 'itc_ratio', 
                     'late_filings_count', 'missing_eway_ratio', 'gst_paid_vs_collected_ratio']
graph_features = ['degree_centrality', 'out_degree', 'cycle_participation', 
                 'cluster_size', 'avg_neighbor_risk']

print("\n📊 Financial Features:")
for f in financial_features:
    if f in data.columns:
        print(f"   • {f}")

print("\n🌐 Graph Features:")
for f in graph_features:
    if f in data.columns:
        print(f"   • {f}")

# Prepare training data
X = data[feature_columns]
y = data["label"]

print(f"\n✓ Feature matrix: {X.shape}")
print(f"✓ Fraud cases: {y.sum()} ({(y.sum()/len(y)*100):.1f}%)")
print(f"✓ Normal cases: {(len(y) - y.sum())} ({((len(y) - y.sum())/len(y)*100):.1f}%)")

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("\n" + "=" * 60)
print("MODEL TRAINING")
print("=" * 60)

# Train Random Forest with optimized parameters
model = RandomForestClassifier(
    n_estimators=200,
    max_depth=15,
    min_samples_split=5,
    min_samples_leaf=2,
    random_state=42,
    class_weight='balanced',  # Handle class imbalance
    n_jobs=-1
)

print("\n🔄 Training Random Forest Classifier...")
model.fit(X_train, y_train)
print("✓ Training complete!")

# Evaluate model
print("\n" + "=" * 60)
print("MODEL EVALUATION")
print("=" * 60)

y_pred = model.predict(X_test)
y_pred_proba = model.predict_proba(X_test)[:, 1]

print("\n📈 Classification Report:")
print(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud']))

print("\n📊 Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

try:
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"\n🎯 ROC-AUC Score: {auc:.4f}")
except:
    print("\n⚠ Could not calculate ROC-AUC")

# Feature importance
print("\n" + "=" * 60)
print("FEATURE IMPORTANCE")
print("=" * 60)

feature_importance = pd.DataFrame({
    'feature': feature_columns,
    'importance': model.feature_importances_
}).sort_values('importance', ascending=False)

print("\n🔍 Top 10 Most Important Features:")
for idx, row in feature_importance.head(10).iterrows():
    bar = "█" * int(row['importance'] * 50)
    print(f"   {row['feature']:30s} {bar} {row['importance']:.4f}")

# Save model
joblib.dump(model, "fraud_model.pkl")
print("\n" + "=" * 60)
print("✓ Model saved as 'fraud_model.pkl'")
print("=" * 60)
print("\n🎉 Training complete! Model ready for deployment.")
print("=" * 60)