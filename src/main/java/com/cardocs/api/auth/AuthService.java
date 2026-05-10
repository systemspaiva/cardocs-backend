package com.cardocs.api.auth;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.security.JwtService;
import com.cardocs.api.security.TokenType;
import com.cardocs.api.users.User;
import com.cardocs.api.users.UserRepository;
import com.cardocs.api.users.UserResponse;
import com.cardocs.api.users.UserRole;
import com.cardocs.api.users.UserStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditLogService auditLogService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCaseAndDeletedAtIsNull(email)) {
            throw new BadRequestException("E-mail já cadastrado");
        }

        User user = User.builder()
            .name(request.name().trim())
            .email(email)
            .passwordHash(passwordEncoder.encode(request.password()))
            .role(UserRole.USER)
            .status(UserStatus.ACTIVE)
            .build();
        userRepository.save(user);
        auditLogService.record(user.getId(), user.getOrganizationId(), "User", user.getId(), AuditAction.USER_CREATED);
        return tokens(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull(request.email().trim().toLowerCase())
            .filter(candidate -> candidate.getStatus() == UserStatus.ACTIVE)
            .orElseThrow(() -> new BadCredentialsException("Credenciais inválidas"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Credenciais inválidas");
        }
        return tokens(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse refresh(RefreshTokenRequest request) {
        var userId = jwtService.parseUserId(request.refreshToken(), TokenType.REFRESH);
        User user = userRepository.findById(userId)
            .filter(candidate -> !candidate.isDeleted())
            .filter(candidate -> candidate.getStatus() == UserStatus.ACTIVE)
            .orElseThrow(() -> new BadCredentialsException("Token inválido"));
        return tokens(user);
    }

    private AuthResponse tokens(User user) {
        return new AuthResponse(
            jwtService.createAccessToken(user),
            jwtService.createRefreshToken(user),
            "Bearer",
            UserResponse.from(user)
        );
    }
}
