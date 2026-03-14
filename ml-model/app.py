from flask import Flask, request, jsonify
import joblib
import pandas as pd
import numpy as np
from datetime import datetime

app = Flask(__name__)

# Load model
try:
    model = joblib.load("fraud_model.pkl")
    print("✓ Fraud detection model loaded successfully")
except FileNotFoundError:
    print("⚠ WARNING: fraud_model.pkl not found. Please run train_model.py first.")
    model = None

# Expected feature names (in order) - MUST match train_model.py
EXPECTED_FEATURES = [
    # Financial features (6) - camelCase to match backend
    'invoiceCount',
    'totalTaxableValue',
    'itcRatio',
    'lateFilingsCount',
    'missingEwayRatio',
    'gstPaidVsCollectedRatio',
    # Graph features (5) - camelCase to match backend
    'degreeCentrality',
    'outDegree',
    'inDegree',
    'cycleParticipation',
    'avgNeighborRisk',
]


def to_probability(raw_score):
    # Logistic mapping from anomaly score to 0..1 probability-like output.
    return float(1.0 / (1.0 + np.exp(-raw_score * 3.0)))


def extract_payload(json_payload):
    if not isinstance(json_payload, dict):
        return {}
    nested = json_payload.get("features")
    if isinstance(nested, dict):
        return nested
    return json_payload

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "model_type": "IsolationForest",
        "timestamp": datetime.now().isoformat(),
    })

@app.route("/features", methods=["GET"])
def get_features():
    """Return expected feature list"""
    return jsonify({
        "expected_features": EXPECTED_FEATURES,
        "count": len(EXPECTED_FEATURES),
    })

@app.route("/predict", methods=["POST"])
def predict():
    """
    Fraud prediction endpoint
    
    Expected input format:
    {
        "invoiceCount": 48,
        "totalTaxableValue": 2400000,
        "itcRatio": 0.92,
        "lateFilingsCount": 3,
        "missingEwayRatio": 0.34,
        "gstPaidVsCollectedRatio": 0.45,
        "degreeCentrality": 15,
        "outDegree": 12,
        "inDegree": 8,
        "cycleParticipation": 1,
        "avgNeighborRisk": 0.7
    }

    Backward compatible input also supported:
    {
        "features": { ...same keys as above... }
    }
    """
    
    if model is None:
        return jsonify({
            "error": "Model not loaded. Please train the model first.",
            "success": False
        }), 500
    
    try:
        data = extract_payload(request.get_json(silent=True))
        
        if not data:
            return jsonify({
                "error": "No data provided",
                "success": False
            }), 400
        
        # Validate and extract features in correct order
        feature_values = []
        missing_features = []
        
        for feature in EXPECTED_FEATURES:
            if feature in data:
                value = data[feature]
                # Handle None values
                if value is None:
                    feature_values.append(0)
                else:
                    feature_values.append(float(value))
            else:
                missing_features.append(feature)
                feature_values.append(0)  # Default to 0 for missing features
        
        if missing_features:
            print(f"⚠ Warning: Missing features: {missing_features}")
        
        # Create DataFrame with correct feature names
        features_df = pd.DataFrame([feature_values], columns=EXPECTED_FEATURES)
        
        # Isolation Forest prediction: -1 anomaly, 1 normal
        pred = int(model.predict(features_df)[0])
        raw_score = float(-model.decision_function(features_df)[0])
        fraud_probability = to_probability(raw_score)
        is_anomaly = pred == -1
        
        # Determine risk level
        if fraud_probability > 0.7:
            risk_level = "HIGH"
        elif fraud_probability > 0.4:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
        
        # Generate confidence explanation
        confidence_factors = []
        
        # Check high-risk indicators
        if data.get('itcRatio', 0) > 0.8:
            confidence_factors.append("High ITC ratio")
        if data.get('cycleParticipation', 0) == 1:
            confidence_factors.append("Circular trading detected")
        if data.get('missingEwayRatio', 0) > 0.3:
            confidence_factors.append("High missing E-Way bills")
        if data.get('avgNeighborRisk', 0) > 0.6:
            confidence_factors.append("Connected to high-risk partners")
        if data.get('outDegree', 0) > 15:
            confidence_factors.append("Unusually high buyer count")
        
        response = {
            "fraud_probability": round(fraud_probability, 4),
            "risk_level": risk_level,
            "confidence_percentage": round(fraud_probability * 100, 2),
            "prediction_class": "FRAUD" if is_anomaly else "NORMAL",
            "raw_anomaly_score": round(raw_score, 6),
            "confidence_factors": confidence_factors,
            "features_used": {
                "financial": len([f for f in EXPECTED_FEATURES[:6] if f in data]),
                "graph": len([f for f in EXPECTED_FEATURES[6:] if f in data]),
            },
            "timestamp": datetime.now().isoformat(),
            "success": True
        }
        
        print(f"✓ Prediction: {risk_level} ({fraud_probability:.2%})")
        
        return jsonify(response)
    
    except Exception as e:
        print(f"✗ Prediction error: {str(e)}")
        return jsonify({
            "error": str(e),
            "success": False,
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route("/predict/batch", methods=["POST"])
def predict_batch():
    """Batch prediction endpoint"""
    
    if model is None:
        return jsonify({
            "error": "Model not loaded",
            "success": False
        }), 500
    
    try:
        payload = request.get_json(silent=True) or {}
        data = payload
        
        if not data or 'businesses' not in data:
            return jsonify({
                "error": "Expected 'businesses' array in request body",
                "success": False
            }), 400
        
        businesses = data['businesses']
        results = []
        
        for business in businesses:
            # Extract features
            feature_values = []
            for feature in EXPECTED_FEATURES:
                feature_values.append(float(business.get(feature, 0)))
            
            features_df = pd.DataFrame([feature_values], columns=EXPECTED_FEATURES)
            
            # Predict
            pred = int(model.predict(features_df)[0])
            raw_score = float(-model.decision_function(features_df)[0])
            fraud_probability = to_probability(raw_score)
            
            if fraud_probability > 0.7:
                risk_level = "HIGH"
            elif fraud_probability > 0.4:
                risk_level = "MEDIUM"
            else:
                risk_level = "LOW"
            
            results.append({
                "gstin": business.get("gstin", "unknown"),
                "fraud_probability": round(fraud_probability, 4),
                "prediction_class": "FRAUD" if pred == -1 else "NORMAL",
                "risk_level": risk_level,
            })
        
        return jsonify({
            "results": results,
            "count": len(results),
            "success": True
        })
    
    except Exception as e:
        return jsonify({
            "error": str(e),
            "success": False
        }), 500

if __name__ == "__main__":
    print("=" * 60)
    print("GST Fraud Detection API")
    print("=" * 60)
    print("\n🚀 Starting Flask server on http://localhost:6001")
    print("\nEndpoints:")
    print("  • GET  /health       - Health check")
    print("  • GET  /features     - List expected features")
    print("  • POST /predict      - Single prediction")
    print("  • POST /predict/batch - Batch predictions")
    print("\n" + "=" * 60 + "\n")
    
    app.run(port=6001, debug=True, host='0.0.0.0')