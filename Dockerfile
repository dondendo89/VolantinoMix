# Use Python 3.11 as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy Python requirements
COPY requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python scraper files
COPY scraper_*.py ./
COPY integrazione_volantini.py ./
COPY analyze_mersi_pdf.py ./

# Create necessary directories
RUN mkdir -p volantini

# Expose port
EXPOSE 5000

# Set environment variables
ENV PORT=5000

# Start a simple HTTP server to keep the container running
CMD ["python", "-m", "http.server", "5000"]