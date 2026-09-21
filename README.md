# route-to-office

เว็บแอปแสดงเส้นทางขับรถจากตำแหน่งปัจจุบันของผู้ใช้ (หรือจุดใดก็ได้ที่เลือกเอง) ไปยังออฟฟิศบริษัท
พร้อมระยะทางและเวลาเดินทางโดยประมาณ วาดเส้นทางบนแผนที่ที่เรนเดอร์ด้วย Google Maps JavaScript API

> **หมายเหตุ:** เวลาเดินทางเป็น **ค่าประมาณจากความเร็วเฉลี่ยของถนน** ไม่ใช่สภาพจราจรแบบเรียลไทม์
> (ดูหัวข้อ [ข้อจำกัดที่ควรรู้](#ข้อจำกัดที่ควรรู้))

## สถาปัตยกรรม

แอปแบ่งเป็น 2 ส่วน โดยมีกติกาเดียว: **การคำนวณเส้นทางและการค้นหาที่อยู่ต้องผ่าน API ของเราเองเท่านั้น**
เบราว์เซอร์ไม่เรียก Google Directions API หรือ Google Geocoding API โดยตรงเด็ดขาด — ข้อยกเว้นเดียวที่อนุญาต
คือ SDK สำหรับ "วาดแผนที่" (Google Maps JavaScript API) ที่โหลดตรงจากเบราว์เซอร์ไปยัง Google เอง
เพราะเป็นแค่การเรนเดอร์แผนที่ ไม่ใช่การเรียกข้อมูลเส้นทาง/ที่อยู่

```
Browser (Nuxt 4 + Google Maps JavaScript API) ──▶ Google (โหลด SDK + map tiles สำหรับเรนเดอร์แผนที่เท่านั้น)
       │
       └────────▶ our API (NestJS, /api/v1/*) ──▶ Google Maps Platform (Directions API, Geocoding API)
```

- **`apps/api`** — NestJS backend เป็นจุดเดียวที่ถือ `GOOGLE_MAPS_SERVER_API_KEY` และเป็นจุดเดียวที่เรียก
  Google Directions/Geocoding API
- **`apps/web`** — Nuxt 4 frontend โหลด Google Maps JavaScript SDK ตรงจากเบราว์เซอร์เพื่อวาดแผนที่ (ด้วย
  `NUXT_PUBLIC_GOOGLE_MAPS_API_KEY` ซึ่งตั้งใจให้เป็น public key) แต่เรียกเฉพาะ API ของเราเองเท่านั้นเวลาต้องการ
  ข้อมูลเส้นทางหรือผลค้นหาที่อยู่ ไม่มี key หรือ SDK ของบุคคลที่สามอื่นฝั่ง client

เหตุผลที่แยกแบบนี้: เพื่อให้ "`GOOGLE_MAPS_SERVER_API_KEY` ไม่มีวันหลุดไปถึงฝั่ง client" เป็นข้อเท็จจริงที่
ตรวจสอบได้จริง (ผ่าน gitleaks + e2e test) ไม่ใช่แค่คำยืนยันเฉยๆ ส่วน key อีกตัวที่ฝั่ง client ถือ
(`NUXT_PUBLIC_GOOGLE_MAPS_API_KEY`) ตั้งใจให้เป็น public ตามโมเดลความปลอดภัยของ Google เอง — ป้องกันด้วยการ
จำกัด HTTP referrer ใน Google Cloud Console แทน (ดูหัวข้อ [Security & Privacy](#security--privacy))

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Backend | [NestJS](https://nestjs.com/) (TypeScript strict) |
| Frontend | [Nuxt 4](https://nuxt.com/) |
| UI | Tailwind CSS + [shadcn-vue](https://www.shadcn-vue.com/) |
| แผนที่ | [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) โหลดตรงในเบราว์เซอร์ |
| Routing / Geocoding | [Google Maps Platform](https://mapsplatform.google.com/) (Directions API, Geocoding API) เรียกผ่าน backend ของเราเท่านั้น |

## Features

- ระบุตำแหน่งต้นทางอัตโนมัติผ่าน Geolocation ของเบราว์เซอร์ พร้อม fallback ครบทุกกรณี
  (ปฏิเสธสิทธิ์ / ไม่รองรับ / พิมพ์ที่อยู่เอง / คลิกเลือกบนแผนที่)
- ต้นทางและปลายทางแก้ไขได้ทั้งคู่เสมอ (ตำแหน่งปัจจุบันเป็นแค่ค่าเริ่มต้น ไม่ใช่ค่าตายตัว)
- คำนวณระยะทาง เวลาเดินทางโดยประมาณ และเวลาถึงโดยประมาณ พร้อมเส้นทางแบบ turn-by-turn
- ค้นหาที่อยู่/สถานที่ได้ทั้งภาษาไทยและอังกฤษ แสดงผลลัพธ์ให้เลือกสูงสุด 5 รายการ (ไม่เดาให้อัตโนมัติ)
  หรือพิมพ์พิกัด lat, lng ตรงๆ ก็ได้ — จำกัดเฉพาะจุดภายในประเทศไทยเท่านั้น
- UI ภาษาไทยทั้งหมด
- Rate limiting แยกตามประเภท endpoint, caching สำหรับ geocode, error response แบบ RFC 7807
  (`application/problem+json`) ที่ไม่มีวันหลุดรายละเอียดจาก upstream หรือ API key ออกไป

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- Node.js (เวอร์ชันตาม `apps/api`/`apps/web` แต่ละที่ — ดู `package.json`)
- โปรเจ็คบน [Google Cloud Console](https://console.cloud.google.com/) ที่เปิดใช้ Google Maps Platform
  (Directions API, Geocoding API, Maps JavaScript API) พร้อมสร้าง **API key 2 ตัวแยกกัน**:
  - key สำหรับ backend (`GOOGLE_MAPS_SERVER_API_KEY`) — จำกัดเฉพาะ Directions API + Geocoding API และ
    ถ้าเป็นไปได้ให้จำกัดด้วย server IP address ด้วย เก็บเป็นความลับ ห้ามหลุดไปฝั่ง client เด็ดขาด
  - key สำหรับ frontend (`NUXT_PUBLIC_GOOGLE_MAPS_API_KEY`) — จำกัดด้วย HTTP referrer ให้เหลือเฉพาะ
    โดเมนที่ deploy จริง ตั้งใจให้เป็น public key (ฝังในเบราว์เซอร์ได้ตามโมเดลความปลอดภัยของ Google) แต่ห้ามเอาไป
    ใช้เรียก API ฝั่ง server เด็ดขาด

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
GOOGLE_MAPS_SERVER_API_KEY=<your-google-maps-server-key>
COMPANY_NAME=<ชื่อบริษัท>
COMPANY_LAT=<ละติจูดออฟฟิศ>
COMPANY_LNG=<ลองจิจูดออฟฟิศ>
CORS_ORIGIN=http://localhost:3001
PORT=3000
```

แก้ไข `apps/web/.env` — ต้องเพิ่ม key อีกตัวที่เป็นคนละตัวกับด้านบน:

```bash
NUXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your-google-maps-browser-key>
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
| `GET /api/v1/health` | liveness check สำหรับ uptime monitor ไม่มี rate limit |

## Deploy

- **`apps/api`** — deploy แบบ Node service ปกติ (เช่น Render) รันด้วย `npm run build && npm run start:prod`
- **`apps/web`** — deploy บน Vercel (`apps/web/vercel.json` กำหนด framework/build command ไว้แล้ว —
  ตั้ง **Root Directory** เป็น `apps/web` ตอน import project) ต้องตั้ง environment variable
  `API_BASE_URL` ให้ชี้ไปที่ URL ของ `apps/api` ที่ deploy จริงเองใน dashboard (ค่านี้ถูก bake เข้า
  build ตอน compile — เปลี่ยนทีหลังต้อง trigger build ใหม่ ไม่ใช่แค่รีสตาร์ท) มี `netlify.toml` เตรียมไว้
  ให้ด้วยเผื่ออยาก deploy ผ่าน Netlify แทน

## Security & Privacy

- แอปนี้ใช้ Google Maps API key **สองตัวที่แยกกันโดยเจตนา และมีโมเดลการเปิดเผยต่างกัน**:
  - `GOOGLE_MAPS_SERVER_API_KEY` (`apps/api`) — เป็นความลับจริง ต้องอยู่บน server เท่านั้น ห้ามหลุดไปฝั่ง
    client เด็ดขาด ตรวจสอบด้วย [gitleaks](https://github.com/gitleaks/gitleaks) ทั้งใน pre-commit hook
    และ CI (`.github/workflows/security.yml`) รวมถึง e2e test เฉพาะที่ยืนยันว่า key นี้ไม่มีวันหลุดออกไปใน
    response ใดๆ
  - `NUXT_PUBLIC_GOOGLE_MAPS_API_KEY` (`apps/web`) — ตั้งใจให้เป็น public และฝังอยู่ใน client bundle ได้
    ตามโมเดลความปลอดภัยของ Google Maps Platform เอง (ไม่ใช่ความหลุดโดยไม่ตั้งใจ) แต่ต้องจำกัดด้วย
    HTTP referrer ใน Google Cloud Console ให้เหลือเฉพาะโดเมนของแอปนี้ และห้ามนำไปใช้เรียก API ฝั่ง
    server เด็ดขาด
- พิกัดและที่อยู่ของผู้ใช้ถือเป็นข้อมูลส่วนบุคคลตาม PDPA — ระบบนี้**ไม่บันทึกลง log และไม่เก็บลงฐานข้อมูล**
- ดูรายละเอียดการตรวจสอบความปลอดภัยแบบเต็ม (OWASP Top 10 / API Security Top 10 / ASVS) ได้ที่
  security checklist ภายในโปรเจ็ค

## ข้อจำกัดที่ควรรู้

- **เวลาเดินทางไม่ใช่ real-time traffic** — backend เรียก Google Directions API โดยตั้งใจไม่ส่งพารามิเตอร์
  `departure_time`/`traffic_model` ที่จะเปิดโหมดคำนวณจากสภาพจราจรสด ดังนั้นเวลาเดินทางที่ได้เป็นค่าประมาณจาก
  ความเร็วทั่วไปของถนน (typical/free-flow) ไม่ใช่ข้อมูลจราจรตามเวลาจริง
- **การค้นหาที่อยู่/สถานที่ครอบคลุมมากขึ้นเนื่องจากใช้ข้อมูลจาก Google Maps** ซึ่งโดยทั่วไปมีฐานข้อมูลชื่อสถานที่
  (POI) เชิงพาณิชย์ที่ครบถ้วนกว่าผู้ให้บริการที่อิงข้อมูลจาก OpenStreetMap — แต่การค้นหาด้วยที่อยู่หรือชื่อถนนที่ชัดเจน
  ยังคงให้ผลลัพธ์ที่แม่นยำกว่าการค้นหาด้วยชื่อสถานที่คลุมเครือเสมอ

## License & Attribution

โปรเจ็คนี้ใช้ข้อมูล/บริการ/ไลบรารีจากภายนอกดังนี้ — ต้องให้เครดิตตามเงื่อนไขของแต่ละเจ้า:

**ข้อมูลแผนที่และเส้นทาง**

| แหล่งที่มา | เงื่อนไข | หมายเหตุ |
|---|---|---|
| [Google Maps Platform](https://cloud.google.com/maps-platform/terms) | [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) | ใช้แสดงแผนที่ (Maps JavaScript API) และคำนวณเส้นทาง/ค้นหาที่อยู่ (Directions API, Geocoding API) — attribution (โลโก้ Google) ถูกเรนเดอร์ลงบนแผนที่โดย SDK เองโดยอัตโนมัติ **ไม่ใช่โมเดลแบบ ODbL ที่ต้องขึ้นเครดิตในตารางแยก** — ห้ามซ่อน/บัง/ตัดโลโก้นี้ด้วย CSS ของแอป (เช่น `overflow: hidden` บน container ที่เล็กกว่าแผนที่จริง หรือ overlay ที่ทับมุมแผนที่) เพราะเป็นเงื่อนไขบังคับของ ToS ไม่ใช่แค่มารยาท — ตรวจสอบแล้ว ณ การ migrate นี้ว่า `RouteMap.client.vue` และ container ของมันไม่มี `overflow-hidden`/`z-index` ใดที่จะบังโลโก้ แต่ควรตรวจซ้ำทุกครั้งที่แก้ layout รอบแผนที่ |

**Open-source libraries หลักที่ใช้**

| ไลบรารี | สัญญาอนุญาต |
|---|---|
| [NestJS](https://nestjs.com/) | MIT |
| [Nuxt](https://nuxt.com/) / [Vue](https://vuejs.org/) | MIT |
| [@googlemaps/js-api-loader](https://www.npmjs.com/package/@googlemaps/js-api-loader) | Apache-2.0 |
| [Tailwind CSS](https://tailwindcss.com/) | MIT |
| [shadcn-vue](https://www.shadcn-vue.com/) ([reka-ui](https://reka-ui.com/)) | MIT |
| [class-validator](https://github.com/typestack/class-validator) / [class-transformer](https://github.com/typestack/class-transformer) | MIT |

ดูรายการไลบรารีทั้งหมดพร้อมสัญญาอนุญาตแบบละเอียดได้จาก `package.json`/`package-lock.json` ของแต่ละแอป
(`apps/api`, `apps/web`)

โค้ดของโปรเจ็คนี้เอง (นอกเหนือจากไลบรารี/บริการภายนอกด้านบน) ยังไม่ได้ระบุสัญญาอนุญาตแบบเปิด — ใช้งานภายในทีม/บริษัทเท่านั้น
