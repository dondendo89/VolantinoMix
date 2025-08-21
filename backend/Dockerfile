# Use Node.js 18 LTS
FROM node:18-alpine

# Install Python for scraper scripts
RUN apk add --no-cache python3 py3-pip

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Copy Python scraper scripts from parent directory
COPY ../scraper_*.py ./
COPY ../requirements.txt ./
COPY ../integrazione_volantini.py ./
COPY ../analyze_mersi_pdf.py ./

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

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