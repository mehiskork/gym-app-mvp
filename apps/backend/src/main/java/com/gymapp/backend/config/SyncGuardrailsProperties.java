package com.gymapp.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "sync")
public class SyncGuardrailsProperties {
    private int maxOpsPerRequest = 250;
}
