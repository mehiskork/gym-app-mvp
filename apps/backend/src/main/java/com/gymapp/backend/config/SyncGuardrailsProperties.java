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
    private int maxRequestBodyBytes = 524288;
    private int maxPayloadBytes = 8192;
    private int maxStringLength = 4096;
    private int maxJsonDepth = 4;
}
