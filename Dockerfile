FROM node:20-slim

WORKDIR /usr/src/app

COPY . .

CMD [ "npm", "start" ]