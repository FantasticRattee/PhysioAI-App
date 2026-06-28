# PhysioAI Handover

วันที่อัปเดต: 2026-06-24

## ภาพรวม

งานหลักที่ทำไปคือเพิ่มระบบ boundary box 95% สำหรับทั้งฝั่ง Patient และ Therapist แล้วปรับ logic ตาม feedback ล่าสุด:

- ใช้กรอบกลางจอ 95% ของพื้นที่กล้อง/แคนวาส
- เหลือแค่ 2 สถานะ: เขียว = อยู่ในกรอบ, แดง = หลุดกรอบ/pose ไม่พอ
- ตัดสีเหลืองและ velocity warning ออกแล้ว เพราะเวลาขยับเร็วทำให้เตือนบ่อยเกินไป
- Setup gate ไม่เช็ค "ไกลเกินไป" แล้ว เช็คแค่ skeleton/key landmarks อยู่ใน boundary box หรือไม่
- รองรับการเลือก framing area เป็น `upper`, `lower`, `full` เพื่อใช้กับท่านั่งหรือท่าที่ไม่ต้องเห็นทั้งตัว

## Patient App

### Boundary box 95%

ไฟล์หลัก:

- `Patient/src/ai/BoundaryBoxGate.js`
- `Patient/src/components/BoundaryBoxOverlay.js`
- `Patient/src/screens/PracticeScreen.js`
- `Patient/src/core/session.js`

พฤติกรรมปัจจุบัน:

- วาด boundary box 95% ทับบน live camera preview
- สีเขียวเมื่อ skeleton/key landmarks ที่จำเป็นอยู่ในกรอบ
- สีแดงเมื่อไม่มี pose, key landmarks สำคัญหาย, หรือ key landmarks หลุดกรอบ
- ไม่มีสถานะเหลืองแล้ว และ `willExit` เป็น `false` เสมอใน logic ปัจจุบัน
- ใช้ `viewPts` ซึ่งเป็นพิกัดจริงบนหน้าจอ camera preview ไม่ใช่ normalized landmark ตรง ๆ

### Key landmarks ตาม body region

เพิ่มแนวคิด `bodyRegion`:

- `upper`: shoulders, elbows, wrists
- `lower`: hips, knees, ankles
- `full`: shoulders, elbows, wrists, hips, knees, ankles

ไฟล์:

- `Patient/src/core/exercises.js`
- `Patient/src/ai/BoundaryBoxGate.js`
- `Patient/src/ai/CameraSetupGate.js`

Built-in exercises ถูกตั้งค่าแล้ว:

- shoulder = `upper`
- knee/hip/balance = `lower`
- squat = `full`

ถ้า exercise ไม่มี `bodyRegion` จะ infer จาก `primaryJoint`.

### กรณียกแขนแล้วข้อมือหลุดด้านบน

ปรับ logic ให้ท่า upper-body ที่ primary joint เป็น shoulder/elbow อนุญาตให้ `left_wrist` และ `right_wrist` หายหรือหลุดด้านบนได้ในบางจังหวะ เพราะท่ายกแขนสองข้างอาจทำให้ข้อมือออกนอกกล้องด้านบนจริง ๆ

แต่จุดสำคัญอื่นยังต้องเห็น เช่น shoulder/elbow. ถ้าไม่เห็นอะไรเลยหรือเห็นแค่น้อยมาก จะเป็นแดง ไม่ใช่เขียว.

### Setup gate

ไฟล์:

- `Patient/src/ai/CameraSetupGate.js`

เปลี่ยนแล้ว:

- ไม่เช็ค body size / too small / move closer
- ใช้ margin 2.5% เท่ากับกรอบ 95%
- เช็ค visibility ของ key landmarks ตาม `bodyRegion`
- ถ้า keypoint ที่จำเป็นหาย จะแนะนำให้เห็นจุดนั้นในกล้อง
- ถ้าจุดอยู่ชิด/หลุดขอบ จะแนะนำให้ขยับเข้า boundary box

### Rep policy เมื่อหลุดกรอบ

ไฟล์:

- `Patient/src/core/session.js`

พฤติกรรม:

- ถ้า live framing เป็น `outside` จะไม่ update rep counter
- ถ้าหลุดกรอบระหว่าง rep จะ mark `needsReset`
- หลังกลับเข้าเฟรมแล้ว ถ้ายังอยู่ที่ peak/ยกแขนค้างอยู่ จะยังไม่นับ
- ต้องกลับสู่ท่า rest ก่อน แล้วค่อยเริ่มทำ rep ใหม่ จึงจะนับได้
- สำหรับ hold exercise ถ้าหลุดกรอบจะ reset hold accumulation

### Countdown ก่อนเริ่ม

ไฟล์:

- `Patient/src/pose/usePractice.js`

พฤติกรรม:

- live mode เริ่มที่ phase `positioning`
- ต้อง framed ดีประมาณ 1 วินาที แล้วจึงเข้า countdown 3-2-1
- ระหว่าง positioning/countdown ไม่ count reps
- มี fallback 10 วินาที ถ้า framing ไม่ผ่านเลย จะเริ่ม countdown เองเพื่อไม่ให้ session ค้างตลอด
- demo mode ยังเริ่ม active ทันทีเหมือนเดิม

### Seated / upper-body angle fallback

ไฟล์:

- `Patient/src/ai/JointAngleCalculator.js`

เพิ่ม fallback สำหรับ shoulder angle เมื่อ hip ไม่เห็น:

- ถ้า joint เป็น left/right shoulder และจุด hip ที่เป็น ray ล่างหาย จะสร้าง fallback point ใต้ shoulder
- ช่วยให้ท่านั่งหรือ upper-body capture/practice ยังได้ shoulder angle แม้ไม่เห็นสะโพก

## Therapist Web

### Boundary box helper

ไฟล์ใหม่:

- `Therapist/shared/ai/BoundaryBoxGate.js`

พฤติกรรม:

- ใช้ normalized BlazePose landmarks
- กรอบ 95% เหมือน Patient
- สถานะมีแค่ `inside` / `outside`
- ไม่มี yellow/warning แล้ว
- ใช้ `bodyRegion` เช่นเดียวกับ Patient
- มี `drawBoundaryBox(ctx, boundary)` สำหรับวาดบน canvas

### Capture page

ไฟล์:

- `Therapist/therapist/capture.html`

เพิ่มแล้ว:

- วาด boundary box บน live camera
- วาด boundary box หลัง import image
- ปุ่ม capture ถูก disable ถ้า boundary ไม่เป็น `inside`
- ถ้ากด capture ตอน boundary ไม่ผ่าน จะ toast ให้ขยับตัวเข้าเฟรม
- reference metadata เก็บเพิ่ม:
  - `bodyRegion`
  - `boundaryStatus`
  - `boundaryBoxRatio: 0.95`
  - `boundaryWillExit`

### Record page

ไฟล์:

- `Therapist/therapist/record.html`

เพิ่มแล้ว:

- วาด boundary box ขณะ live/demo recording
- ถ้า boundary เป็น `outside` จะไม่ push frame เข้า rows
- CSV มีคอลัมน์เพิ่ม:
  - `boundary_status`
  - `boundary_will_exit`
- ตอนนี้ `boundary_will_exit` จะเป็น `0` เพราะตัด warning/velocity ออกแล้ว

### Body region ในหน้า Therapist

ไฟล์:

- `Therapist/shared/core/exercises.js`
- `Therapist/therapist/capture.html`

เพิ่มตัวเลือก framing area ในฟอร์ม custom exercise:

- ส่วนบน / Upper body
- ส่วนล่าง / Lower body
- ทั้งตัว / Full body

ยังคงมี `primaryJoint` แยกไว้สำหรับ angle/rep logic ส่วน `bodyRegion` ใช้สำหรับกำหนดว่าต้องเห็น skeleton ส่วนไหนในกล้อง.

## Patient Web / Web Dependencies

ไฟล์:

- `Patient/package.json`

ตอนนี้มี web dependencies แล้ว:

- `react-dom`
- `react-native-web`
- `@expo/metro-runtime`

คำสั่งรัน Patient web:

```bash
cd /Users/title/Desktop/App/Patient
npx expo start --web -c
```

หมายเหตุ: Patient web เป็น Expo/Metro ไม่ใช่ Python. แต่ live camera pose ใช้ native module (`react-native-mediapipe` / VisionCamera) จึงอาจใช้ได้ไม่ครบบน web เว้นแต่ทำ web camera pipeline แยกเพิ่ม.

## วิธีรัน

### Patient บน iPhone

```bash
cd /Users/title/Desktop/App/Patient
npx expo run:ios --device
```

ถ้า build dev client ผ่านแล้ว และต้องการเปิด Metro ต่อ:

```bash
cd /Users/title/Desktop/App/Patient
npx expo start --dev-client -c
```

ถ้าเจอ Hermes script error ว่า `/usr/local/bin/node: No such file or directory`:

```bash
sudo mkdir -p /usr/local/bin
sudo ln -sf "$(which node)" /usr/local/bin/node
```

### Patient Web

```bash
cd /Users/title/Desktop/App/Patient
npx expo start --web -c
```

### Therapist Web

Therapist เป็น static web จึงรันด้วย Python ได้:

```bash
cd /Users/title/Desktop/App/Therapist
python3 -m http.server 3000
```

แล้วเปิด:

- `http://localhost:3000/therapist/capture.html`
- `http://localhost:3000/therapist/record.html`

## Tests / Sanity Checks ที่เคยเช็คแล้ว

เช็คด้วย node snippets / syntax checks ก่อนหน้านี้:

- Patient boundary:
  - อยู่ในกรอบ -> `inside`
  - ขยับเร็วแต่ยังอยู่ในกรอบ -> `inside`
  - หลุดกรอบ -> `outside`
  - missing elbow -> `outside`
  - expected wrist missing สำหรับ upper-body arm raise -> `inside`
  - expected wrist top exit -> `inside`
- Therapist boundary:
  - logic เทียบเท่าฝั่ง Patient
  - ไม่มี warning/yellow
- Setup gate:
  - ตัวเล็กแต่ยังอยู่ในกรอบ -> ok
  - clipped/outside -> not ok
  - expected wrists missing สำหรับ upper body -> ok
  - missing elbow -> not ok
- Seated upper-body:
  - boundary `inside`
  - setup gate ok
  - shoulder angle ยังเป็นตัวเลขได้แม้ไม่เห็น hip

ยังไม่ได้รัน full native iOS build ผ่านหลังจากเจอ duplicate symbol ล่าสุด.

## สถานะ Git / ไฟล์ที่เกี่ยวข้อง

`Patient` ไม่ใช่ git repo ใน path นี้ จึงดู `git status` แยกไม่ได้.

`Therapist` เป็น git repo และมีไฟล์ที่แก้/เพิ่ม:

- modified: `Therapist/shared/ai/JointAngleCalculator.js`
- modified: `Therapist/shared/core/exercises.js`
- modified: `Therapist/therapist/capture.html`
- modified: `Therapist/therapist/record.html`
- untracked: `Therapist/shared/ai/BoundaryBoxGate.js`

ไฟล์ Patient ที่เกี่ยวข้องกับงานนี้:

- `Patient/src/ai/BoundaryBoxGate.js`
- `Patient/src/ai/CameraSetupGate.js`
- `Patient/src/ai/JointAngleCalculator.js`
- `Patient/src/components/BoundaryBoxOverlay.js`
- `Patient/src/core/exercises.js`
- `Patient/src/core/session.js`
- `Patient/src/pose/usePractice.js`
- `Patient/src/screens/PracticeScreen.js`
- `Patient/package.json`

## ทำวันนี้ / Latest Work

เพิ่มระบบ motion quality และ custom exercise multi-joint ต่อจาก boundary work เดิม โดยโฟกัสที่การตรวจ transition จาก `rest` ไป `target` ไม่ใช่เช็คแค่ pose ตอนปลายทาง.

### Patient: multi-joint motion + rep policy

ไฟล์หลัก:

- `Patient/src/ai/MultiJointMotion.js`
- `Patient/src/core/session.js`
- `Patient/src/core/exercises.js`
- `Patient/src/core/store.js`
- `Patient/src/screens/HomeScreen.js`
- `Patient/src/screens/PracticeScreen.js`
- `Patient/src/pose/usePractice.js`

เพิ่มแล้ว:

- สร้าง helper `MultiJointMotion` สำหรับคำนวณ progress หลาย joint จาก `rest -> target`
- รองรับ `repJoints` หลายจุด เช่น squat ใช้ knee+hip, ยกแขนสองข้างใช้ shoulder ซ้าย+ขวา
- motion score ระหว่าง transition มี `tempoScore`, `smoothnessScore`, `pathScore`, `syncScore`, `trackingScore`
- `pathScore` ใช้ landmark 2D จริง เช่น shoulder/elbow จะดู trajectory ของ wrist แทนการดูตำแหน่งหัวไหล่อย่างเดียว
- rep counter ใช้ `atPeak` / `atRest` จาก multi-joint progress
- ถ้า motion ผิดหนัก เช่นเร็วมาก, path หลุดมาก, tracking หายเยอะ, sync/sequence ผิดหนัก จะ mark invalid และต้องกลับ rest ก่อนเริ่ม rep ใหม่
- session summary เก็บ motion breakdown เช่น `overallScore`, `avgPoseScore`, `avgMotionScore`, `validReps`, `invalidRepCount`, `motionIssueCounts`, `repQualityLog`
- Patient summary screen แสดง dashboard หลังจบ session พร้อม top issues

### Movement patterns

เพิ่ม schema/logic:

- `movementPattern: 'unilateral'`
- `movementPattern: 'bilateralSync'`
- `movementPattern: 'alternating'`
- `alternatingSides: ['left', 'right']`
- `countMode: 'per_side' | 'cycle'`

พฤติกรรม:

- `unilateral`: ทำข้างเดียว หรือหลาย joint ฝั่งเดียว เช่น `right_shoulder + right_elbow`; ไม่โดน sync penalty
- `bilateralSync`: ซ้าย+ขวาต้องขึ้นพร้อมกัน เช่น ยกแขนสองข้าง
- `alternating`: ลำดับเป็น `rest -> left_target -> rest -> right_target -> rest`
- ถ้า alternating แล้วยกผิดข้างก่อน จะ invalid ด้วย issue `sequence`
- ถ้า alternating แล้วยกสองข้างพร้อมกัน จะ invalid/หักคะแนนด้วย issue `inactiveSide`
- `per_side`: นับซ้าย 1 rep, ขวา 1 rep
- `cycle`: ซ้าย+ขวาครบจึงนับ 1 rep

### Therapist: custom exercise rest/target capture

ไฟล์หลัก:

- `Therapist/shared/ai/MultiJointMotion.js`
- `Therapist/shared/core/exercises.js`
- `Therapist/shared/core/store.js`
- `Therapist/therapist/capture.html`
- `Therapist/therapist/plan.html`
- `Therapist/therapist/dashboard.html`

เพิ่มแล้ว:

- ฟอร์มเพิ่ม custom exercise ไม่ต้องเลือก primary joint แล้ว
- เลือกแค่ body region, movement pattern และ count mode เฉพาะ alternating
- Capture custom rep แบบใหม่:
  - ปกติ: จับ `rest` แล้วจับ `target`
  - alternating: จับ `rest`, จับ `left target`, จับ `right target`
- หลังจับครบ ระบบ auto-select `repJoints` จาก body region และ range ของมุมที่ขยับจริง
- ถ้าเลือก `unilateral` แล้วอีกข้างขยับติดมา ระบบจะกรองเหลือฝั่ง dominant side
- ถ้าเลือก `alternating` จะสร้าง `sideMotions.left` และ `sideMotions.right`
- reference metadata เก็บเพิ่ม `movementPattern`, `alternatingSides`, `countMode`, `repJoints`, `jointMotion`, `sideMotions`, `restJointAngles`, `targetJointAnglesBySide`, `restLandmarks`, `targetLandmarksBySide`
- Plan Builder แนบ custom exercise snapshot ไปกับ plan item เพื่อให้ Patient รู้จัก custom exercise id
- Dashboard เพิ่ม labels สำหรับ issues `sequence`, `inactiveSide`, `tracking`

### Therapist strict reference framing

ฝั่ง Therapist Capture/Record ใช้ boundary แบบ strict full body แล้ว เพื่อให้ reference/dataset เห็นข้อมือและข้อเท้าครบที่สุด แม้ท่านั้นจะเป็น upper/lower body. ฝั่ง Patient ยังใช้ region-aware boundary เพื่อไม่ให้ผู้ป่วยโดนบังคับเกินจำเป็น.

### Tests / Sanity Checks วันนี้

รันแล้วผ่าน:

- `node --check`:
  - `Patient/src/ai/MultiJointMotion.js`
  - `Patient/src/core/session.js`
  - `Patient/src/core/exercises.js`
  - `Patient/src/core/store.js`
  - `Therapist/shared/ai/MultiJointMotion.js`
  - `Therapist/shared/core/exercises.js`
  - `Therapist/shared/core/store.js`
- Extract module script แล้ว `node --check`:
  - `Therapist/therapist/capture.html`
  - `Therapist/therapist/plan.html`
  - `Therapist/therapist/dashboard.html`
- Babel transform ผ่าน:
  - `Patient/src/screens/HomeScreen.js`
  - `Patient/src/screens/PracticeScreen.js`
  - `Patient/src/pose/usePractice.js`
- Synthetic motion tests:
  - same-side multi joint เช่น `right_shoulder + right_elbow` ได้ `syncScore = 100`
  - bilateral lag เช่น left/right shoulder ไม่พร้อมกัน ได้ `syncScore = 0` และ invalid
  - alternating ลำดับถูก นับ rep ได้
  - alternating เริ่มผิดข้าง ไม่เพิ่ม rep และเพิ่ม invalid
  - alternating `cycle` mode ซ้าย+ขวาครบแล้วนับ 1 rep

ยังไม่ได้รัน full native iOS build หลังงานวันนี้.

## Known Issues / งานค้าง

### 1. iOS duplicate symbol ตอน link MediaPipe

Error ล่าสุด:

```text
duplicate symbol 'google::base::Logger::~Logger'
... libMediaPipeTasksCommon_device_graph.a[734](logging.o)
› Linking PhysioAI » PhysioAI
```

ตรวจแล้วเจอว่า `ios/Pods/Target Support Files/Pods-PhysioAI/Pods-PhysioAI.debug.xcconfig` มีทั้ง:

- `-framework "MediaPipeTasksCommon"`
- `-force_load "$(PODS_ROOT)/MediaPipeTasksCommon/frameworks/graph_libraries/libMediaPipeTasksCommon_device_graph.a"`

น่าจะเป็นสาเหตุที่ link symbol ซ้ำกันระหว่าง MediaPipe framework กับ graph static archive.

ยังไม่ได้ apply fix เพราะ user interrupt ก่อน. แนวทางถัดไป:

1. เพิ่ม workaround ใน `Patient/ios/Podfile` ภายใต้ `post_install` เพื่อลบเฉพาะ `OTHER_LDFLAGS[sdk=iphoneos*]` และ `OTHER_LDFLAGS[sdk=iphonesimulator*]` ที่เป็น `-force_load` ของ MediaPipe graph
2. รัน:

```bash
cd /Users/title/Desktop/App/Patient/ios
pod install
```

3. รัน build อีกครั้ง:

```bash
cd /Users/title/Desktop/App/Patient
npx expo run:ios --device
```

ถ้า workaround นี้ทำให้ MediaPipe runtime ใช้ graph ไม่ได้ ต้องเลือกอีกทางคือ pin/เปลี่ยน version `react-native-mediapipe`/`MediaPipeTasksVision` หรือ disable iOS autolink ของ `react-native-mediapipe` ชั่วคราวเพื่อให้ app build ผ่านแต่ live pose native จะไม่ทำงาน.

### 2. `NativeJSLogger.default.addListener is not a function`

เคยมี error นี้ใน Metro log:

```text
TypeError: NativeJSLogger.default.addListener is not a function
Invariant Violation: "main" has not been registered
```

ยังไม่ได้แก้ในรอบนี้. ต้องดู stack trace เต็มหลัง native build ผ่านหรือหลังเปิด dev client ใหม่ เพราะ error นี้อาจเป็นผลตามจาก native module mismatch/load fail.

### 3. Patient web live camera

ตอนนี้รัน web ได้ด้วย Expo web แต่ live pose camera ของ Patient ยังผูกกับ native MediaPipe/VisionCamera. ถ้าต้องการ Patient web ใช้กล้องจริง ต้องทำ web pose detection pipeline เพิ่มแยกจาก native.

## Decision Notes

- Boundary box ใช้ skeleton/key landmarks ไม่ใช่ตรวจจากภาพดิบ
- 95% box หมายถึง margin รอบด้าน 2.5%
- สีเหลืองถูกตัดออกแล้วตาม feedback ล่าสุด
- Setup gate ไม่เช็คว่าไกลเกินไปแล้ว เพื่อไม่ให้ผู้ใช้โดนเตือนผิดกรณี
- `primaryJoint` ยังสำคัญสำหรับการคำนวณ angle/rep
- `bodyRegion` สำคัญสำหรับ framing ว่าต้องเห็นส่วนบน/ส่วนล่าง/ทั้งตัว
- ถ้าหลุดกรอบระหว่างทำ rep ต้องกลับ rest ในกรอบก่อน จึงเริ่ม rep ใหม่ได้
