FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
COPY .env .    # ⬅️ Important to include env variables

EXPOSE 3029
CMD ["node", "server.js"]
