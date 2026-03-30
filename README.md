<div align="center">

<img src="docs/assets/banner.png" alt="RepairDesk Banner" width="100%" />

# 🎫 RepairDesk

**The ultimate digital operating system for modern independent repair shops.**  
*Built for speed. Engineered for profit. Designed for clarity.*

[![Deployment](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=for-the-badge&logo=vercel)](https://repairdeskz.vercel.app)
[![Framework](https://img.shields.io/badge/Next.js-14-0070F3?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Backend](https://img.shields.io/badge/FastAPI-v1.0-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Database](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-47A248?style=for-the-badge)](LICENSE)

</div>

---

## 📖 Overview

**RepairDesk** is a mobile-first Progressive Web App (PWA) designed to replace paper trails and messy spreadsheets. It empowers shop owners to manage the entire lifecycle of a repair—from drop-off and digital signature to automated WhatsApp notifications and profit tracking.

---

## ✨ Premium Features

| ⚡ **Lightning Tickets** | 📦 **Smart Inventory** | 💰 **Profit Engine** |
| :--- | :--- | :--- |
| Create and track repair tickets in under 60 seconds with 1-click status updates. | Real-time tracking with low-stock alerts and automatic part deduction. | Automatic calculation of revenue, part costs, and net margin per ticket. |

| 🟢 **WhatsApp Sync** | ✍️ **Digital Signatures** | 📊 **Financial Hub** |
| :--- | :--- | :--- |
| Automated notifications for confirmation, updates, and feedback links via WhatsApp. | Legal protection with on-screen signature capture for every ticket. | Dynamic reports showing daily, weekly, and monthly shop performance. |

| 🧾 **Pro Invoicing** | 📱 **PWA Ready** | ⭐ **Feedback Loop** |
| :--- | :--- | :--- |
| Generate sleek PDF invoices on-the-fly and share them instantly with customers. | Fully installable on iOS and Android with offline-first synchronization. | Built-in customer feedback system to measure satisfaction and growth. |

---

## 🛠️ Modern Tech Stack

### Frontend & UI
- **Framework**: [Next.js 14](https://nextjs.org) (App Router)
- **Styling**: [TailwindCSS](https://tailwindcss.com) + [Lucide Icons](https://lucide.dev)
- **State Mgmt**: [Zustand](https://github.com/pmndrs/zustand)
- **Validation**: [Zod](https://zod.dev) + [React Hook Form](https://react-hook-form.com)

### Backend & API
- **Language**: [Python 3.12](https://python.org)
- **Framework**: [FastAPI](https://fastapi.tiangolo.com) (High Performance)
- **ORM**: [SQLAlchemy 2.0](https://www.sqlalchemy.org) (Async)
- **Task Queue**: [Redis](https://redis.io)

### DevOps & Infrastructure
- **Hosting**: [Vercel](https://vercel.com) (Frontend + Serverless Functions)
- **Containerization**: [Docker](https://docker.com) + Compose
- **PDF Engine**: [WeasyPrint](https://weasyprint.org)

---

## 🚀 Getting Started

### 📋 Prerequisites

*   **Docker Desktop** (Recommended for local dev)
*   **Node.js 20+**
*   **Python 3.12+**

### 🛠️ One-Click Setup (Windows)

We provide a specialized batch script for Windows users to initialize and run the entire stack:
```powershell
./init-and-run.bat
```

### 🐳 Manual Setup (Docker)

```bash
# 1. Clone & Enter
git clone https://github.com/mohd98zaid/RepairDesk.git
cd RepairDesk

# 2. Setup Environment
cp .env.example .env

# 3. Boot Services
make dev

# 4. Initialize Database
make migrate
make seed
```

---

## 📂 Project Architecture

```text
RepairDesk/
├── apps/
│   ├── api/          # FastAPI Backend (Python) - High performance async API
│   └── web/          # Next.js Frontend (TSX) - Mobile-first PWA dashboard
├── docs/             # Requirements, Architecture, and Assets
├── infra/            # Docker, Nginx & Compose configurations
├── api/              # Vercel Serverless Bridge (Entry point)
├── Makefile          # Unified command interface (make dev, make seed)
└── vercel.json       # Monorepo deployment configuration
```

---

## 🗺️ Roadmap

- [x] **Phase 1**: Foundation, Auth (JWT/RBAC), and Dockerization
- [x] **Phase 2**: Customer CRM & Ticket Lifecycle Management
- [x] **Phase 3**: Inventory Management & Part Cost Tracking
- [x] **Phase 4**: Automated WhatsApp Notifications & Digital Signatures
- [x] **Phase 5**: PDF Invoicing & Advanced Profit Analytics
- [ ] **Phase 6**: multi-shop support & Cloud Inventory Sync

---

## 🛡️ Security & Compliance

- **Stateless Auth**: JWT with secure HTTP-only cookie-like logic and token rotation.
- **RBAC**: Role-Based Access Control (Owner vs Staff).
- **Audit Logs**: Tracking status changes and inventory deductions.

---

<div align="center">
Built with ❤️ by [Xaid](https://github.com/mohd98zaid)  
*Empowering independent shops with enterprise-grade tech.*
</div>

