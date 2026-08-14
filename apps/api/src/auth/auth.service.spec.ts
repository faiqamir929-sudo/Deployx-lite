import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token') } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('should reject duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
    await expect(service.register({ email: 'a@b.com', password: '12345678', name: 'Test' }))
      .rejects.toThrow(ConflictException);
  });

  it('should reject invalid login', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'a@b.com', password: 'wrong' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('should register a new user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: '1', email: 'new@b.com', name: 'New', role: Role.DEVELOPER,
    });
    const result = await service.register({ email: 'new@b.com', password: '12345678', name: 'New' });
    expect(result.accessToken).toBe('token');
    expect(result.user.email).toBe('new@b.com');
  });
});
