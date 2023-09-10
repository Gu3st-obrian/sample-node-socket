FROM node:16-alpine

# Working container app directory.
WORKDIR /app

# Copy application source code.
COPY . .

# Install dependences and generate index js file.
RUN npm install --omit=dev && npm i typescript && npm run generate

# Container runner command.
CMD ["npm", "run", "start:prod"]
