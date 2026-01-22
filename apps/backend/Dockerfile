# Build stage
FROM maven:3.9.8-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml .
# Pre-fetch deps for cache friendliness
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app

# Copy all jars from target
COPY --from=build /app/target/*.jar /app/

# Pick the Spring Boot runnable jar (exclude "original-" if present)
RUN set -eux; \
    ls -la /app; \
    JAR="$(ls /app/*.jar | grep -v 'original-' | head -n 1)"; \
    echo "Using jar: $JAR"; \
    mv "$JAR" /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
