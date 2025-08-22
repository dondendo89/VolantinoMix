#!/bin/bash

# Script per configurare automaticamente le variabili d'ambiente su Vercel
# Esegui questo script con: bash setup-vercel-env.sh

echo "🚀 Configurazione variabili d'ambiente per Vercel..."

# Verifica che Vercel CLI sia installato
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI non trovato. Installalo con: npm i -g vercel"
    exit 1
fi

# Configura le variabili d'ambiente essenziali
echo "📝 Configurazione variabili d'ambiente..."

# MongoDB URI - DEVI SOSTITUIRE CON IL TUO VALORE REALE
echo "⚠️  IMPORTANTE: Modifica questo script e inserisci il tuo MONGODB_URI reale!"
MONGODB_URI="mongodb+srv://domenicobuttafarro:lkZUu1F3GgNS7KvG@cluster0.jis8nd2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

# Configura NODE_ENV
vercel env add NODE_ENV production production
echo "✅ NODE_ENV configurato"

# Configura MONGODB_URI
vercel env add MONGODB_URI "$MONGODB_URI" production
echo "✅ MONGODB_URI configurato"

# Configura PORT (opzionale per Vercel)
vercel env add PORT 5000 production
echo "✅ PORT configurato"

# Configura JWT_SECRET
JWT_SECRET="volantinomix-super-secret-jwt-key-$(date +%s)"
vercel env add JWT_SECRET "$JWT_SECRET" production
echo "✅ JWT_SECRET configurato"

# Configura MAX_FILE_SIZE
vercel env add MAX_FILE_SIZE 50mb production
echo "✅ MAX_FILE_SIZE configurato"

# Configura CORS_ORIGIN
vercel env add CORS_ORIGIN "https://volantino-mix.vercel.app" production
echo "✅ CORS_ORIGIN configurato"

# Configura PYTHON_PATH
vercel env add PYTHON_PATH "/usr/bin/python3" production
echo "✅ PYTHON_PATH configurato"

# Configura SCRIPTS_PATH
vercel env add SCRIPTS_PATH "./backend" production
echo "✅ SCRIPTS_PATH configurato"

echo ""
echo "🎉 Configurazione completata!"
echo "📋 Variabili configurate:"
echo "   - NODE_ENV"
echo "   - MONGODB_URI (⚠️  RICORDA DI MODIFICARE CON IL TUO DATABASE REALE!)"
echo "   - PORT"
echo "   - JWT_SECRET"
echo "   - MAX_FILE_SIZE"
echo "   - CORS_ORIGIN"
echo "   - PYTHON_PATH"
echo "   - SCRIPTS_PATH"
echo ""
echo "🔄 Vercel farà automaticamente il redeploy dell'applicazione."
echo "⏱️  Attendi circa 1-2 minuti e poi testa le API."
echo ""
echo "🔗 Testa con: curl https://volantino-mix.vercel.app/health"