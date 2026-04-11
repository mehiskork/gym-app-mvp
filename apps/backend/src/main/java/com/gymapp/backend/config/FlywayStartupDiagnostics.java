package com.gymapp.backend.config;

import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Temporary startup diagnostics for Flyway wiring on Railway.
 */
@Slf4j
@Configuration
public class FlywayStartupDiagnostics {

    @Bean
    ApplicationRunner flywayDiagnosticsRunner(
            ApplicationContext applicationContext,
            ObjectProvider<Flyway> flywayProvider) {
        return new ApplicationRunner() {
            @Override
            public void run(ApplicationArguments args) throws Exception {
                Resource[] migrationResources = findMigrationResources();
                log.info("Flyway diagnostics: found {} migration resources on classpath", migrationResources.length);
                for (Resource resource : migrationResources) {
                    log.info("Flyway diagnostics: migration resource={}", resource.getURL());
                }

                String[] flywayBeanNames = applicationContext.getBeanNamesForType(Flyway.class);
                log.info("Flyway diagnostics: Flyway bean count={}", flywayBeanNames.length);

                flywayProvider.ifAvailable(flyway -> {
                    log.info("Flyway diagnostics: Flyway bean detected, querying migration info");
                    int applied = flyway.info().applied().length;
                    int pending = flyway.info().pending().length;
                    log.info("Flyway diagnostics: applied={}, pending={}", applied, pending);
                });
            }
        };
    }

    private Resource[] findMigrationResources() throws IOException {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        return resolver.getResources("classpath*:db/migration/*.sql");
    }
}