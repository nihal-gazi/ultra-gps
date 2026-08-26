# Citations and References

This document outlines the foundational scientific papers and engineering references underpinning the kinematic equations, inertial sensor fusion algorithms, and Dead Reckoning models implemented in **ultra-GPS**.

---

### 1. Dynamic Step Length Estimation (The Weinberg Model)

- **Citation**: Weinberg, H. (2002). *Using the ADXL202 in Pedometer and Personal Navigation Applications*. Analog Devices Application Note, AN-602, 1-6.
- **Key Contribution**: Established the non-linear biomechanical fourth-root acceleration step length equation:
  $$SL = K \cdot \sqrt[4]{a_{\max} - a_{\min}}$$
  where $a_{\max}$ and $a_{\min}$ are the peak vertical accelerations during the foot strike and stance phases, and $K$ is the calibrated biomechanical constant.
- **Application in ultra-GPS**: Powers the dynamic stride length engine, continuously calculating custom step distances based on real-time walking intensity and cadence.

---

### 2. Zero Velocity Update (ZUPT) & Drift Elimination

- **Citation**: Foxlin, E. (2005). *Pedestrian Tracking with Shoe-Mounted Inertial Sensors*. IEEE Computer Graphics and Applications, 25(6), 38–46. https://doi.org/10.1109/MCG.2005.140
- **Key Contribution**: Formalized the Zero Velocity Update (ZUPT) technique for inertial navigation systems (INS), demonstrating how detecting stationary stance phases eliminates cubic position drift in accelerometer integration.
- **Application in ultra-GPS**: Implemented via kinetic energy variance gating ($\sigma^2 < 0.02$) to lock velocity to zero during stationary intervals, preventing standing drift caused by hand micro-tremors.

---

### 3. Step-and-Heading Pedestrian Dead Reckoning (SH-PDR) & Sensor Fusion

- **Citation**: Harle, R. (2013). *A Survey of Indoor Inertial Positioning Systems for Pedestrians*. IEEE Communications Surveys & Tutorials, 15(3), 1281–1293. https://doi.org/10.1109/SURV.2012.121912.00075
- **Key Contribution**: Defined the comprehensive framework for Step-and-Heading Pedestrian Dead Reckoning (SH-PDR) on mobile devices, including gravity decoupling, complementary gyro-compass fusion, and orientation-invariant signal filtering.
- **Application in ultra-GPS**: Governs the orientation-invariant gravity extraction pipeline, the 6-DOF complementary filter, and the geodesic destination point translation along Earth curvature.
