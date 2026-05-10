MirrorBreaker
Stopping Real-Time Deepfake CEO Fraud Before It Causes Damage

MirrorBreaker is an AI-powered real-time deepfake detection system designed to identify and prevent live video impersonation attacks, especially CEO fraud and identity spoofing attempts. The system analyzes physiological inconsistencies, facial behavior, and micro-expression patterns directly from live video streams with ultra-low latency.

Features
Real-time deepfake detection
Live video stream analysis
Micro-blink pattern tracking
Facial movement consistency analysis
Physiological signal verification
AI-powered authenticity detection
On-device processing
Ultra-low latency inference (<200ms)
CEO fraud prevention system
Scalable modular architecture
Problem Statement

Deepfake technology is increasingly being used for impersonation attacks, financial scams, and executive fraud. Existing systems often fail to detect highly realistic synthetic videos in real time.

MirrorBreaker aims to provide a fast, lightweight, and reliable solution capable of detecting manipulated live video streams before damage occurs.

Tech Stack
Frontend
React
Vite
Tailwind CSS
Backend
Python
FastAPI / Flask
OpenCV
AI / ML
TensorFlow / PyTorch
CNN-based deepfake detection
Physiological signal analysis
Blink and micro-expression detection
Project Workflow
Capture live video stream
Extract facial landmarks
Analyze blink frequency and facial motion
Detect physiological inconsistencies
Run AI deepfake detection model
Generate authenticity score
Alert user if suspicious activity is detected
Installation

Clone the repository:

git clone https://github.com/SnehaDP13/MirrorBreaker.git

Go to project directory:

cd MirrorBreaker

Install dependencies:

npm install

Run frontend:

npm run dev

Run backend:

python app.py
Future Improvements
Audio deepfake detection
Multi-person verification
Mobile deployment
Edge AI optimization
Blockchain-based identity verification
Advanced biometric authentication
Use Cases
Corporate security
Video call authentication
Executive fraud prevention
Banking and fintech verification
Government identity protection
Secure remote meetings
Contributors
SnehaDP13 , SinchanaRG26
License

This project is developed for research, innovation, and hackathon purposes.
