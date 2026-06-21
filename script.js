// นำ Web App URL อันใหม่ที่เพิ่ง Deploy มาวางที่นี่ครับ!!!
const API_URL = 'https://script.google.com/macros/s/AKfycbwUZ85arV2wdp_pAiOR2Ceqm-EalSCtqpPboOzV3MzRpT6u63KeeTPnevc7oZFkfjybiQ/exec'; 
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const video = document.getElementById('video');
const statusText = document.getElementById('status'); // ต้องมีแท็ก <p id="status"></p> ในหน้า index.html
let faceMatcher;
let isScanning = false;

// 1. โหลดโมเดล AI และดึงข้อมูลใบหน้าจาก Google Sheet
async function startSystem() {
    statusText.innerText = "กำลังเชื่อมต่อระบบ AI และดาวน์โหลดฐานข้อมูล...";
    
    // โหลดสมอง AI
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);

    // โหลดฐานข้อมูลใบหน้าที่ลงทะเบียนไว้จาก Google Sheet
    try {
        const response = await fetch(API_URL);
        const students = await response.json();
        
        const labeledFaceDescriptors = students.map(student => {
            const descriptorArray = new Float32Array(student.descriptor);
            return new faceapi.LabeledFaceDescriptors(student.id, [descriptorArray]);
        });

        if (labeledFaceDescriptors.length > 0) {
            // สร้างตัวตรวจสอบใบหน้า (ความแม่นยำ 50%)
            faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.5); 
            statusText.innerText = "✅ ดาวน์โหลดฐานข้อมูลเรียบร้อย กำลังเปิดกล้อง...";
            startVideo();
        } else {
            statusText.innerText = "❌ ยังไม่มีข้อมูลใบหน้าในระบบ กรุณาลงทะเบียนก่อน";
        }
    } catch (error) {
        console.error(error);
        statusText.innerText = "❌ เชื่อมต่อฐานข้อมูลล้มเหลว";
    }
}

// 2. เปิดกล้อง
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
            statusText.innerText = "🎥 ระบบสแกนพร้อมใช้งาน";
        })
        .catch(err => console.error("Camera error:", err));
}

// 3. เริ่มสแกนเวลาเดินผ่าน
video.addEventListener('play', () => {
    // สร้าง Canvas เพื่อใช้วาดกรอบสี่เหลี่ยมทับวิดีโอ
    const canvas = faceapi.createCanvasFromMedia(video);
    document.body.append(canvas);
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (!faceMatcher) return; // ถ้ายอดฐานข้อมูลยังไม่มา ให้รอไปก่อน

        const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        for (const detection of resizedDetections) {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            
            // วาดกรอบและชื่อบนหน้าจอ (โชว์รหัสนักเรียน)
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: bestMatch.label });
            drawBox.draw(canvas);

            // ถ้าตรวจเจอคนที่มีในระบบ และยังไม่ได้สแกน (ป้องกันการส่งรัวๆ)
            if (bestMatch.label !== 'unknown' && !isScanning) {
                isScanning = true;
                const studentId = bestMatch.label;
                statusText.innerText = `⏳ กำลังบันทึกข้อมูลรหัส: ${studentId}...`;

                // 📸 แอบถ่ายรูปจากวิดีโอ
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = video.videoWidth;
                snapCanvas.height = video.videoHeight;
                snapCanvas.getContext('2d').drawImage(video, 0, 0);
                // ตัดเอาเฉพาะเนื้อหา Base64 ไปส่ง (ไม่เอาหัว 'data:image/jpeg;base64,')
                const imageBase64 = snapCanvas.toDataURL('image/jpeg', 0.6).split(',')[1]; 

                try {
                    // ส่งข้อมูล + รูปภาพ ไปที่ Google Sheet
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({ 
                            action: 'logScan', 
                            studentId: studentId, 
                            status: 'สแกนเข้าโรงเรียน',
                            image: imageBase64 
                        })
                    });
                    const result = await res.json();
                    
                    if(result.status === 'success') {
                        statusText.innerText = `✅ บันทึกสำเร็จ: ${result.name}`;
                        statusText.style.color = "green";
                    }
                } catch(e) {
                    console.error("Error sending data:", e);
                }

                // สั่งให้หน่วงเวลา 5 วินาที ก่อนที่จะสแกนคนต่อไปได้ (แก้ปัญหาการยิง Telegram รัวๆ)
                setTimeout(() => {
                    isScanning = false;
                    statusText.innerText = "🎥 ระบบสแกนพร้อมใช้งาน";
                    statusText.style.color = "black";
                }, 5000);
            }
        }
    }, 1000); // เช็กใบหน้าทุกๆ 1 วินาที
});

// สั่งเริ่มระบบ
window.onload = startSystem;
