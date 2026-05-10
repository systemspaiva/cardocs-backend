package com.cardocs.api.security;

import com.cardocs.api.common.ForbiddenException;
import com.cardocs.api.users.User;
import com.cardocs.api.users.UserService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CurrentUserService {

    private final UserService userService;

    public User getCurrentUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof UUID userId) {
            return userService.getActiveUser(userId);
        }
        throw new ForbiddenException("Usuário autenticado inválido");
    }
}
