# Use Node.js 18 as base image
FROM node:18-slim

# Install Python3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create symbolic link for python command
RUN ln -s /usr/bin/python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy backend package.json and package-lock.json
COPY backend/package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy Python requirements
COPY backend/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ .

# Copy Python scraper files from root directory
COPY scraper_*.py ./
COPY integrazione_volantini.py ./
COPY analyze_mersi_pdf.py ./

# Create necessary directories
RUN mkdir -p public/pdfs volantini

# Expose port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["npm", "start"]