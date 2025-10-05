FROM node:20-alpine

WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --only=production

# copy source
COPY src ./src

EXPOSE 3000
CMD ["node", "src/server.js"]
