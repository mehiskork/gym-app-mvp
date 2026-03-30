package com.gymapp.backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "claim")
public class ClaimProperties {
    private long codeTtlMinutes = 10;
    private boolean devUserHeaderEnabled = false;
}