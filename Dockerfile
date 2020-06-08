FROM node:10.21.0-alpine

WORKDIR /app/

COPY . /app/

RUN yarn

RUN yarn bundle

EXPOSE 3000

CMD yarn start
