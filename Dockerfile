FROM node:18-slim

WORKDIR /usr/src/app

COPY . .

CMD [ "npm", "start" ]