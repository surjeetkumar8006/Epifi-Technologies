# Step 1: Build the React application
FROM node:22-alpine as builder

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Run build to generate static files in /app/dist
RUN npm run build

# Step 2: Serve the application using Nginx
FROM nginx:alpine

# Copy built files from the build stage to Nginx default public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80 (we will map this to 3000 in docker-compose)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
