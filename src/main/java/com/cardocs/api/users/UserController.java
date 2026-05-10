package com.cardocs.api.users;

import com.cardocs.api.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/users")
public class UserController {

    private final CurrentUserService currentUserService;

    @GetMapping("/me")
    UserResponse me() {
        return UserResponse.from(currentUserService.getCurrentUser());
    }
}
