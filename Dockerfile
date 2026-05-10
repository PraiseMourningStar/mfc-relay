FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY public ./public
COPY themes ./themes
COPY bin ./bin

EXPOSE 8080
CMD ["npm", "start"]
