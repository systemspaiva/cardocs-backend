package com.cardocs.api.security;

import com.cardocs.api.config.AppProperties;
import com.cardocs.api.users.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final AppProperties properties;
    private final SecretKey key;

    public JwtService(AppProperties properties) {
        this.properties = properties;
        this.key = Keys.hmacShaKeyFor(properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(User user) {
        return createToken(user, TokenType.ACCESS, properties.getJwt().getAccessTokenExpiration());
    }

    public String createRefreshToken(User user) {
        return createToken(user, TokenType.REFRESH, properties.getJwt().getRefreshTokenExpiration());
    }

    public UUID parseUserId(String token, TokenType expectedType) {
        Claims claims = Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();
        String type = claims.get("type", String.class);
        if (!expectedType.name().equals(type)) {
            throw new IllegalArgumentException("Tipo de token inválido");
        }
        return UUID.fromString(claims.getSubject());
    }

    private String createToken(User user, TokenType type, java.time.Duration expiration) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("email", user.getEmail())
            .claim("role", user.getRole().name())
            .claim("type", type.name())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(expiration)))
            .signWith(key)
            .compact();
    }
}
