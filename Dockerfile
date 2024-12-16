# The image the works runs this from.
#
# It exists so a scheduled job has one thing to call rather than a node version
# and a checkout to keep in step. Nothing in here is a build: the program is
# plain modules, so the image is the runtime, the manifest and the source.

FROM node:20.18.2-bookworm-slim

# Install the production dependency set first so an edit to src does not
# invalidate the layer. There is exactly one runtime dependency and it is
# pinned in the lock file.
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY examples ./examples

# The container runs as the node user the base image already carries. Nothing
# here writes inside the image, so the filesystem can be read only.
USER node

ENV NODE_ENV=production

ENTRYPOINT ["node", "/app/bin/shadelot.js"]
CMD ["commands"]
