FROM gradle:9.4.1-jdk21-alpine AS build

WORKDIR /workspace
COPY . .
RUN gradle --no-daemon bootJar

FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S cardocs && adduser -S cardocs -G cardocs
WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar /app/cardocs-backend.jar

USER cardocs
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/cardocs-backend.jar"]

