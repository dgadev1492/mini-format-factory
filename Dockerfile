FROM node:22-bookworm-slim

# Installer FFmpeg et FFprobe
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Définir le dossier de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install --omit=dev

# Copier le reste du projet
COPY . .

# Créer les dossiers de travail
RUN mkdir -p uploads converted

# Exposer le port utilisé par l'application
EXPOSE 3000

# Démarrer Express
CMD ["npm", "start"]
