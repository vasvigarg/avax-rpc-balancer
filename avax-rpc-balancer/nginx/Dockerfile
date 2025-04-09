# Use the official stable Nginx image from Docker Hub
FROM nginx:stable-alpine

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom Nginx configuration
COPY conf.d/default.conf /etc/nginx/conf.d/default.conf

# Optional: If you have static content or other configs, copy them too
# COPY html /usr/share/nginx/html

# Expose port 80 (and 443 if you configure SSL within the container)
EXPOSE 80
# EXPOSE 443

# The default Nginx entrypoint starts Nginx in the foreground
# CMD ["nginx", "-g", "daemon off;"] (This is the default, usually no need to specify)