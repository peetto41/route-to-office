# route-to-office

เว็บแอปแสดงเส้นทางขับรถจากตำแหน่งปัจจุบันของผู้ใช้ (หรือจุดใดก็ได้ที่เลือกเอง) ไปยังออฟฟิศบริษัท
พร้อมระยะทางและเวลาเดินทางโดยประมาณ วาดเส้นทางบนแผนที่ OpenStreetMap

> **หมายเหตุ:** เวลาเดินทางเป็น **ค่าประมาณจากความเร็วเฉลี่ยของถนน** ไม่ใช่สภาพจราจรแบบเรียลไทม์
> (ดูหัวข้อ [ข้อจำกัดที่ควรรู้](#ข้อจำกัดที่ควรรู้))

## สถาปัตยกรรม

แอปแบ่งเป็น 2 ส่วน โดยมีกติกาเดียว: **เบราว์เซอร์ไม่คุยกับ OpenRouteService โดยตรง**

```
Browser (Nuxt 4 + MapLibre GL) ──▶ our API (NestJS, /api/v1/*) ──▶ OpenRouteService (routing, geocoding)
                                                                └─▶ OpenStreetMap (map tiles, ผ่าน proxy)
```

- **`apps/api`** — NestJS backend เป็นจุดเดียวที่ถือ API key ของ OpenRouteService
- **`apps/web`** — Nuxt 4 frontend เรียกเฉพาะ API ของเราเองเท่านั้น ไม่มี SDK หรือ key ของบุคคลที่สามฝั่ง client

เหตุผลที่แยกแบบนี้: เพื่อให้ "API key ไม่มีวันหลุดไปถึงฝั่ง client" เป็นข้อเท็จจริงที่ตรวจสอบได้จริง
(ผ่าน gitleaks + e2e test) ไม่ใช่แค่คำยืนยันเฉยๆ

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Backend | [NestJS](https://nestjs.com/) (TypeScript strict) |
| Frontend | [Nuxt 4](https://nuxt.com/) |
| UI | Tailwind CSS + [shadcn-vue](https://www.shadcn-vue.com/) |
| แผนที่ | [MapLibre GL JS](https://maplibre.org/) เทียบ tile จาก OpenStreetMap (ผ่าน proxy ของเราเอง) |
| Routing / Geocoding | [OpenRouteService](https://openrouteservice.org/) (Directions API, Geocoding แบบ Pelias) |

## Features

- ระบุตำแหน่งต้นทางอัตโนมัติผ่าน Geolocation ของเบราว์เซอร์ พร้อม fallback ครบทุกกรณี
  (ปฏิเสธสิทธิ์ / ไม่รองรับ / พิมพ์ที่อยู่เอง / คลิกเลือกบนแผนที่)
- ต้นทางและปลายทางแก้ไขได้ทั้งคู่เสมอ (ตำแหน่งปัจจุบันเป็นแค่ค่าเริ่มต้น ไม่ใช่ค่าตายตัว)
- คำนวณระยะทาง เวลาเดินทางโดยประมาณ และเวลาถึงโดยประมาณ พร้อมเส้นทางแบบ turn-by-turn
- ค้นหาที่อยู่/สถานที่ได้ทั้งภาษาไทยและอังกฤษ แสดงผลลัพธ์ให้เลือกสูงสุด 5 รายการ (ไม่เดาให้อัตโนมัติ)
  หรือพิมพ์พิกัด lat, lng ตรงๆ ก็ได้ — จำกัดเฉพาะจุดภายในประเทศไทยเท่านั้น
- UI ภาษาไทยทั้งหมด
- Rate limiting แยกตามประเภท endpoint, caching สำหรับ geocode/tiles, error response แบบ RFC 7807
  (`application/problem+json`) ที่ไม่มีวันหลุดรายละเอียดจาก upstream หรือ API key ออกไป

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- Node.js (เวอร์ชันตาม `apps/api`/`apps/web` แต่ละที่ — ดู `package.json`)
- API key จาก [openrouteservice.org](https://openrouteservice.org/dev/#/signup) (ฟรี)

### ติดตั้ง

```bash
git clone <repo-url>
cd route-to-office

npm install --prefix apps/api
npm install --prefix apps/web

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

แก้ไข `apps/api/.env`:

```bash
ORS_API_KEY=<your-openrouteservice-key>
COMPANY_NAME=<ชื่อบริษัท>
COMPANY_LAT=<ละติจูดออฟฟิศ>
COMPANY_LNG=<ลองจิจูดออฟฟิศ>
CORS_ORIGIN=http://localhost:3001
PORT=3000
```

### รันโปรเจ็ค

```bash
npm --prefix apps/api run start:dev     # http://localhost:3000/api/v1
npm --prefix apps/web run dev           # http://localhost:3001
```

เปิด `http://localhost:3001`

### ทดสอบ

```bash
npm --prefix apps/api run lint && npm --prefix apps/api run test && npm --prefix apps/api run test:e2e
npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run typecheck
```

## API Contract (`apps/api`)

| Endpoint | คำอธิบาย |
|---|---|
| `POST /api/v1/route` | คำนวณเส้นทางจากต้นทางไปปลายทาง (ปลายทาง default = ออฟฟิศ) |
| `GET /api/v1/geocode?address=...` | แปลงที่อยู่เป็นพิกัด คืนสูงสุด 5 ผลลัพธ์ (ขอบเขตประเทศไทยเท่านั้น) |
| `GET /api/v1/company` | ข้อมูลออฟฟิศ (ชื่อ + พิกัด) สำหรับ marker บนแผนที่ |
| `GET /api/v1/tiles/{z}/{x}/{y}` | proxy map tile จาก OpenStreetMap |
| `GET /api/v1/health` | liveness check สำหรับ uptime monitor ไม่มี rate limit |

## Deploy

- **`apps/api`** — deploy แบบ Node service ปกติ (เช่น Render) รันด้วย `npm run build && npm run start:prod`
- **`apps/web`** — deploy บน Vercel (`apps/web/vercel.json` กำหนด framework/build command ไว้แล้ว —
  ตั้ง **Root Directory** เป็น `apps/web` ตอน import project) ต้องตั้ง environment variable
  `API_BASE_URL` ให้ชี้ไปที่ URL ของ `apps/api` ที่ deploy จริงเองใน dashboard (ค่านี้ถูก bake เข้า
  build ตอน compile — เปลี่ยนทีหลังต้อง trigger build ใหม่ ไม่ใช่แค่รีสตาร์ท) มี `netlify.toml` เตรียมไว้
  ให้ด้วยเผื่ออยาก deploy ผ่าน Netlify แทน

## Security & Privacy

- API key ของ OpenRouteService อยู่บน server เท่านั้น ตรวจสอบด้วย [gitleaks](https://github.com/gitleaks/gitleaks)
  ทั้งใน pre-commit hook และ CI (`.github/workflows/security.yml`)
- พิกัดและที่อยู่ของผู้ใช้ถือเป็นข้อมูลส่วนบุคคลตาม PDPA — ระบบนี้**ไม่บันทึกลง log และไม่เก็บลงฐานข้อมูล**
- ดูรายละเอียดการตรวจสอบความปลอดภัยแบบเต็ม (OWASP Top 10 / API Security Top 10 / ASVS) ได้ที่
  security checklist ภายในโปรเจ็ค

## ข้อจำกัดที่ควรรู้

- **เวลาเดินทางไม่ใช่ real-time traffic** — OpenRouteService คำนวณจากความเร็วเฉลี่ยของถนน ไม่มีข้อมูลจราจรสด
  ต่างจากผู้ให้บริการเชิงพาณิชย์บางราย
- **การค้นหาที่อยู่/สถานที่สำคัญด้วยชื่อภาษาอังกฤษอาจแม่นยำน้อยกว่า** เนื่องจากใช้ข้อมูลจาก OpenStreetMap
  ซึ่งฐานข้อมูลชื่อสถานที่ (POI) ยังไม่ครบเท่าผู้ให้บริการเชิงพาณิชย์บางราย — การค้นหาด้วยที่อยู่หรือชื่อถนนที่ชัดเจนจะแม่นยำกว่า

## License & Attribution

โปรเจ็คนี้ใช้ข้อมูล/บริการ/ไลบรารีจากภายนอกดังนี้ — ต้องให้เครดิตตามเงื่อนไขของแต่ละเจ้า:

**ข้อมูลแผนที่และเส้นทาง**

| แหล่งที่มา | สัญญาอนุญาต | หมายเหตุ |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | [ODbL](https://opendatacommons.org/licenses/odbl/) | © OpenStreetMap contributors — ข้อมูลแผนที่/tile ทั้งหมด แสดง attribution นี้บนแผนที่ทุกหน้าตามเงื่อนไขของ ODbL |
| [OpenRouteService](https://openrouteservice.org/) | ให้บริการภายใต้เงื่อนไขของ [openrouteservice.org](https://openrouteservice.org/terms-of-service/) (ข้อมูลฐานมาจาก OpenStreetMap เช่นกัน) | ใช้คำนวณเส้นทางและค้นหาที่อยู่ ผ่าน backend ของเราเท่านั้น |

**Open-source libraries หลักที่ใช้**

| ไลบรารี | สัญญาอนุญาต |
|---|---|
| [NestJS](https://nestjs.com/) | MIT |
| [Nuxt](https://nuxt.com/) / [Vue](https://vuejs.org/) | MIT |
| [MapLibre GL JS](https://maplibre.org/) | BSD-3-Clause |
| [Tailwind CSS](https://tailwindcss.com/) | MIT |
| [shadcn-vue](https://www.shadcn-vue.com/) ([reka-ui](https://reka-ui.com/)) | MIT |
| [class-validator](https://github.com/typestack/class-validator) / [class-transformer](https://github.com/typestack/class-transformer) | MIT |

ดูรายการไลบรารีทั้งหมดพร้อมสัญญาอนุญาตแบบละเอียดได้จาก `package.json`/`package-lock.json` ของแต่ละแอป
(`apps/api`, `apps/web`)

โค้ดของโปรเจ็คนี้เอง (นอกเหนือจากไลบรารี/บริการภายนอกด้านบน) ยังไม่ได้ระบุสัญญาอนุญาตแบบเปิด — ใช้งานภายในทีม/บริษัทเท่านั้น
