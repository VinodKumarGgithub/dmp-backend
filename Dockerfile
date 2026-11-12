# Use Node.js 20 official image
FROM node:20-alpine

# Set working directory
WORKDIR /DATAMANAGEMENT

# Install git (if not already in Node image)
# RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN apk add --no-cache git

COPY package*.json ./

COPY . ./

# Install app dependencies
RUN npm install

# Expose the port your app listens on
EXPOSE 3000

# Seed admin and start app
CMD npm run seed:admin && npm run start
