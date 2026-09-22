FROM node:22-bookworm-slim

# Installer FFmpeg et ffprobe
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Dossier de travail
WORKDIR /app

# Copier les fichiers du projet
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm install

# Copier le reste de l'application
COPY . .

# Port utilisé par l'application
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

# Démarrer Express
CMD ["npm", "start"]
