# Use Node.js 18 LTS - Updated for script path fix
FROM node:18-alpine

# Install Python for scraper scripts
RUN apk add --no-cache python3 py3-pip

# Set working directory
WORKDIR /app

# Copy Python requirements first
COPY backend/requirements.txt ./

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy Python scraper scripts from backend directory
COPY backend/scraper_*.py ./
COPY backend/integrazione_volantini.py ./
COPY backend/analyze_mersi_pdf.py ./

# Copy backend package files
COPY backend/package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Create uploads and temp directories
RUN mkdir -p uploads /temp

# Set proper permissions
RUN chown -R node:node /app /temp
USER node

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]