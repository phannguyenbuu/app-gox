FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/conf.d/default.conf \
  && printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '' \
    '  location / {' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '' \
    '  location /assets/ {' \
    '    try_files $uri =404;' \
    '    access_log off;' \
    '    add_header Cache-Control "public, max-age=31536000, immutable";' \
    '  }' \
    '}' \
  > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
