# 📰 The Aggregator
**High-performance RSS/Atom feed aggregator with real-time Redis Pub/Sub**

This is a high-performance, event-driven RSS/Atom feed aggregation service built on Node.js. It is designed as a stateless worker that continuously monitors multiple feed sources, manages item history, and publishes new content in real-time via Redis Pub/Sub. 

The modular design ensures stability, efficient processing, and robust error handling for a reliable content distribution pipeline.

> **Note:** Please note that this is the **backend code** for **CyberDeck** on the **CyberPunk Network**.  
> The **front-end** part for managing news, categories, and sources is **not provided**.

---

## ✨ Features

- **Modular Architecture** – Clean separation of concerns using dedicated classes.
- **Real-Time Publishing** – Instant delivery via `feed:wire:<CATEGORY_ID>` Redis channels.
- **Duplicate Prevention** – In-memory + DB history tracking per feed.
- **Smart Scheduling** – Per-feed refresh intervals (configurable in ms).
- **Robust Error Handling** – Custom `FeedError` with context; errors logged to DB and published.
- **Dynamic Control** – Admin commands via `aggregator` channel (`reload`, `add_feed`, etc.).
- **Consumer-Friendly** – Wildcard subscriptions for flexible consumption.
---

## 🌟 Tech Stack
- **Node.js (ES Modules):** Modern, fast runtime.
- **Redis:** Redis for ultra-fast real-time Pub/Sub messaging..
- **MySQL / MariaDB:** Relational storage for persistent data.
---


## 📦 Getting Started

### 1. Prerequisites

Ensure you have the following installed and running:

- Node.js (version 16+)
- MySQL/MariaDB Server
- Redis Server

### 2. Get the Code
Clone the repository and install the development dependencies.

```bash
git clone https://github.com/alek-niko/aggregator.git
cd aggregator
npm install
```

### 3. Environment Configuration

Create a  `.env`  file in the project root to configure connections:

```bash
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=rss_db

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 4. Setup your prefered Database
> **Note:** You must set up your own **MySQL/MariaDB** database to use with this system — this setup is **not provided**.  
> The backend relies on **4 tables only**. Full table structures are defined in `config/database.sql`.


### 5. Running the Application

Install dependencies:
```bash
npm install
```

Start the aggregator:
```bash
node app.js
```

---

## 🗂️ Project Directory Structure

```text
src
├── database
│   ├── pool.js
│   └── redis.js
├── models
│   ├── error.js
│   ├── feed.js
│   ├── index.js
│   └── item.js
├── rss
│   ├── Aggregator.js
│   ├── Feed.js
│   ├── FeedEmitter.js
│   ├── FeedError.js
│   ├── FeedItem.js
│   └── FeedManager.js
└── services
│   └── database.js
├─ .env
├─ package.json
└─ app.js
```
---

## 🧬 Code Structure Overview

The core logic is found within the `src/rss/` directory:

| File             | Role                  | Key Functionality                                                                 |
|------------------|-----------------------|-----------------------------------------------------------------------------------|
| `Aggregator.js`  | **Main Orchestrator** | Coordinates `FeedEmitter`, handles DB calls, manages Redis clients, and registers process listeners. |
| `FeedEmitter.js` | **Scheduler/Event Hub** | Manages the collection of all feeds, sets up refresh intervals, and emits `new-item` and `error` events. |
| `FeedManager.js` | **Processing Unit**   | Manages a single feed's lifecycle: fetches data, sorts items, filters against history, and triggers emission. |
| `Feed.js`        | **Data Source Abstraction** | Manages a single RSS URL, implements the fetch/parse logic, and maintains the item history for filtering. |
| `FeedError.js`   | **Custom Error**      | Extends `Error` to add contextual properties like the originating feed's URL. |
| `FeedItem.js`    | **Item Model**        | Normalizes RSS entries (`title`, `link`, `pubDate`, `guid`, etc.) |

---

## 📡 Redis Pub/Sub Channels

| Channel Name                  | Direction | Purpose                                                                                           |
|-------------------------------|-----------|---------------------------------------------------------------------------------------------------|
| `feed:wire:<CATEGORY_ID>`     | **Publish**   | The channel for new news items. Consumers can subscribe via category ID.                       |
| `aggregator`                  | **Subscribe** | Listens for administrative commands (e.g., `reload`, `add_feed`) for dynamic control.            |
| `aggregator-errors`                  | **Publish** | All processing errors (fetch failures, parsing issues) are published here for external monitoring.            |

---

### ⚡ Consumer Subscription Guide

Any consumer that wants all news items simply needs to subscribe using a wildcard pattern:

| Consumer Goal            | Subscription Method                        |
|--------------------------|--------------------------------------------|
| **All Feeds**            | `P-SUBSCRIBE feed:wire:*`                  |
| **Only Category 5**      | `SUBSCRIBE feed:wire:5`                    |
| **Categories 1 and 2**   | `SUBSCRIBE feed:wire:1 feed:wire:2`        |

---

## 🎬 Demo

Explore the real-time data pipeline: [Aggregator](https://cyberpunk.xyz/aggregator)

---

## 📄 License

The Aggregator is released under the **GNU General Public License v3 (GPLv3)**.  
For inquiries, please reach out via the [contact form](https://cyberpunk.xyz/contact).

---

> This code is part of the CyberDeck project under the [CyberPunk Network](https://cyberpunk.xyz). 
> Also check [ Deck framework ](https://github.com/alek-niko/deck) - A modern, lean, and open-source front-end framework.

---