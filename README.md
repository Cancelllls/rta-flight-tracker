# RTA Flight Tracker

A real-time aviation tracking platform providing live visualization of global flight traffic, built with React, Leaflet, and a Python backend.

## Project Structure

- `/frontend`: Vite-powered React application using `react-leaflet` for high-performance map rendering.
- `/backend`: Python service that aggregates live ADS-B data and flight streams to serve real-time coordinates to the frontend.

## Features

- **Live Tracking:** Real-time updates of aircraft positions on an interactive global map.
- **Data Streaming:** High-efficiency data pipelines pulling from live aviation feeds.
- **Modern UI:** Tailwind CSS powered sleek user interface.

## Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
