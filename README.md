# ultra-GPS

A modern, high-precision React web application that uses **OpenStreetMap** to pinpoint the device's real-time location and seamlessly switches to **Pedestrian Dead Reckoning (PDR)** sensor fusion (accelerometer + gyroscope + compass) when GPS is lost or turned off.

---

## Features

- **OpenStreetMap View**: Interactive map rendering live device position with dynamic heading beam/cone and dual-color path history (GPS vs. Dead Reckoning).
- **Pedestrian Dead Reckoning (PDR)**:
  - **Dynamic Step Detection**: Low-pass and gravity isolation filters on 3-axis accelerometer data with local peak/valley detection.
  - **Weinberg Step Length Estimation**:
    $$SL = K \cdot \sqrt[4]{a_{max} - a_{min}}$$
  - **Gyro-Compass Complementary Filter**: Fuses gyroscope rotation rate ($\omega_z$) with tilt-compensated compass heading to prevent jitter and gyro drift:
    $$\theta_{t} = \alpha \cdot (\theta_{t-1} + \omega_z \Delta t) + (1 - \alpha) \cdot \theta_{compass}$$
  - **Direct Spherical Geodesy Translation**: Converts step displacement ($d$) and bearing ($\theta$) into exact Earth coordinates:
    $$\phi_2 = \arcsin(\sin\phi_1 \cos(d/R) + \cos\phi_1 \sin(d/R) \cos\theta)$$
    $$\lambda_2 = \lambda_1 + \arctan2(\sin\theta \sin(d/R) \cos\phi_1, \cos(d/R) - \sin\phi_1 \sin\phi_2)$$
- **Instant Fallback**: Automatically switches to Dead Reckoning upon GPS loss or manual GPS disable toggle.
- **Built-in Desktop Simulator**: Allows testing step injection, continuous walking simulation, and compass bearing turns on desktop browsers without physical IMU hardware.
- **Real-Time Sensor Waveform**: Canvas visualizer plotting live acceleration magnitude, step triggers, pitch, and roll.
- **Calibration & Tuning Modal**: Fine-tune gait constant $K$, peak detection threshold, and filter weights in real-time.
- **Clean UI**: Strict minimalist cyberpunk-technical design with clean SVG icons and **zero emojis**.

---

## Installation & Running

```bash
# Install dependencies
npm install

# Start Vite Development Server
npm run dev

# Build for Production
npm run build
```

---

## Technical Stack

- React 19 + TypeScript + Vite
- Leaflet + OpenStreetMap
- Tailwind CSS v4
- Lucide React (clean SVG icons)
