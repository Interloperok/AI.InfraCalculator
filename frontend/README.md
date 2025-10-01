# AI Server Calculator Frontend

This is a React application that provides a user interface for calculating AI server requirements based on the backend API.

## Features

- Interactive sliders for all configuration parameters
- Real-time calculation of server requirements
- Visual representation of results with charts
- Responsive design using Tailwind CSS
- Collapsible parameter sections with smooth animations
- Comprehensive error handling
- Dual input controls (sliders + text fields)
- Integer validation for specific parameters

## Prerequisites

- Node.js (v14 or higher)
- Backend server running on http://localhost:8000

## Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at http://localhost:3000

## Backend API

This frontend connects to the backend API at http://localhost:8000. Make sure the backend server is running before using the calculator.

The API endpoints used:
- POST /v1/size - Calculate server requirements
- GET /v1/healthz - Health check

## Project Structure

```
src/
├── components/
│   ├── Calculator.js      # Main calculator component
│   ├── CalculatorForm.js  # Form with collapsible sections and dual inputs
│   └── ResultsDisplay.js  # Results visualization
├── services/
│   └── api.js            # API service functions
├── App.js               # Main application component
├── App.css              # Global styles
└── index.js             # Application entry point
```

## Technologies Used

- React
- Tailwind CSS
- Recharts for data visualization
- Axios for API communication

## Configuration

You can customize the backend API URL by creating a `.env` file in the root directory:

```
REACT_APP_API_URL=http://your-backend-url:port
```

## Development

To run the development server:

```bash
npm start
```

To build for production:

```bash
npm run build
```

## Input Controls

The calculator provides dual input controls for each parameter:
- Sliders for visual adjustment
- Text fields for precise numeric input
- Integer validation for specific parameters:
  - Internal Users
  - External Users
  - Prompt Tokens
  - Answer Tokens
  - RPS per Active User
  - Session Duration (sec)
  - Params (Billions)
  - Bytes per Param
  - Layers
  - GPU Memory (GB)
  - GPUs per Server
  - Tokens/sec per Instance