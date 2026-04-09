#!/usr/bin/env bash
# Start both Flask backend and React frontend dev servers
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting PIC KPI Dashboard..."

# Start Flask backend
echo "Starting Flask backend on port 5000..."
cd "$SCRIPT_DIR/backend"
python app.py &
FLASK_PID=$!

# Start Vite dev server
echo "Starting React frontend on port 5173..."
cd "$SCRIPT_DIR/frontend"
npx vite --host &
VITE_PID=$!

echo ""
echo "Dashboard running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $FLASK_PID $VITE_PID 2>/dev/null; exit" INT TERM
wait
