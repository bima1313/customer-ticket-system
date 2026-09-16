import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service.js';
import { LlmCacheService } from './cache/llm-cache.service.js';
import { LlmAnalysisResultDto } from './dto/llm-analysis-result.dto.js';

// ---------------------------------------------------------------------------
// Mock modul @google/genai agar test tidak memanggil API Gemini sungguhan.
// ---------------------------------------------------------------------------
const generateContentMock = vi.fn();

vi.mock('@google/genai', () => {
  class GoogleGenAIMock {
    models = { generateContent: generateContentMock };
  }
  return {
    GoogleGenAI: GoogleGenAIMock,
    Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
  };
});

type MockType<T> = {
  [P in keyof T]?: any;
};

// ---------------------------------------------------------------------------
// Helper: buat modul testing
// ---------------------------------------------------------------------------
async function createModule(
  configServiceMock: Partial<ConfigService>,
  cacheServiceMock: MockType<LlmCacheService> = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      LlmService,
      { provide: ConfigService, useValue: configServiceMock },
      { provide: LlmCacheService, useValue: cacheServiceMock },
    ],
  }).compile();
}

// ---------------------------------------------------------------------------
// Suite utama
// ---------------------------------------------------------------------------
describe('LlmService', () => {
  let service: LlmService;
  let cacheServiceMock: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  // ConfigService mock yang mengembalikan API key valid secara default
  const configServiceMock = {
    get: vi.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Pastikan mock selalu mengembalikan API key valid sebelum setiap test
    configServiceMock.get.mockReturnValue('test-api-key');
    cacheServiceMock = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const module = await createModule(configServiceMock, cacheServiceMock);
    service = module.get<LlmService>(LlmService);
  });

  // -------------------------------------------------------------------------
  // 1. Inisialisasi service
  // -------------------------------------------------------------------------
  describe('Inisialisasi', () => {
    it('harus terdefinisi (service instance ada)', () => {
      expect(service).toBeDefined();
    });

    it('harus melempar Error ketika GEMINI_API_KEY tidak diset (undefined)', async () => {
      const mockTanpaKey = { get: vi.fn().mockReturnValue(undefined) };

      await expect(createModule(mockTanpaKey)).rejects.toThrow(
        'GEMINI_API_KEY tidak diset.',
      );
    });

    it('harus melempar Error ketika GEMINI_API_KEY berupa string kosong', async () => {
      const mockKeyKosong = { get: vi.fn().mockReturnValue('') };

      await expect(createModule(mockKeyKosong)).rejects.toThrow(
        'GEMINI_API_KEY tidak diset.',
      );
    });

    it('harus memanggil configService.get dengan argumen "GEMINI_API_KEY"', () => {
      expect(configServiceMock.get).toHaveBeenCalledWith('GEMINI_API_KEY');
    });
  });

  // -------------------------------------------------------------------------
  // 2. analyzeAndDraftReply – happy path
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – happy path', () => {
    it('harus mengembalikan instance LlmAnalysisResultDto ketika respon JSON valid', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: 'Silakan reset password Anda.',
        }),
      });

      const result = await service.analyzeAndDraftReply(
        'Login gagal',
        'Lupa password',
      );

      expect(result).toBeInstanceOf(LlmAnalysisResultDto);
    });

    it('harus mengembalikan nilai category dan suggestedReply yang benar', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'billing',
          suggestedReply: 'Kami akan segera meninjau tagihan Anda.',
        }),
      });

      const result = await service.analyzeAndDraftReply(
        'Tagihan salah',
        'Tagihan bulan ini tidak sesuai.',
      );

      expect(result.category).toBe('billing');
      expect(result.suggestedReply).toBe(
        'Kami akan segera meninjau tagihan Anda.',
      );
    });

    it('harus memanggil generateContent dengan model dan config yang benar', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: 'Tim teknis kami akan segera menghubungi Anda.',
        }),
      });

      await service.analyzeAndDraftReply('Error aplikasi', 'App crash tiba-tiba');

      expect(generateContentMock).toHaveBeenCalledOnce();
      expect(generateContentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.0-flash',
          config: expect.objectContaining({
            responseMimeType: 'application/json',
          }),
        }),
      );
    });

    it('harus menyertakan subject dan message di dalam prompt contents', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Terima kasih atas pertanyaan Anda.',
        }),
      });

      const subject = 'Pertanyaan produk';
      const message = 'Bagaimana cara menggunakan fitur X?';

      await service.analyzeAndDraftReply(subject, message);

      const callArgs = generateContentMock.mock.calls[0][0];
      expect(callArgs.contents).toContain(subject);
      expect(callArgs.contents).toContain(message);
    });

    it('harus menyertakan responseSchema dengan field category dan suggestedReply sebagai required', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Balasan.',
        }),
      });

      await service.analyzeAndDraftReply('Subjek', 'Pesan');

      const callArgs = generateContentMock.mock.calls[0][0];
      const schema = callArgs.config.responseSchema;

      expect(schema).toBeDefined();
      expect(schema.required).toContain('category');
      expect(schema.required).toContain('suggestedReply');
    });

    it('responseSchema category harus punya enum billing/technical/general', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Balasan.',
        }),
      });

      await service.analyzeAndDraftReply('Subjek', 'Pesan');

      const callArgs = generateContentMock.mock.calls[0][0];
      const categorySchema = callArgs.config.responseSchema.properties.category;

      expect(categorySchema.enum).toEqual(
        expect.arrayContaining(['billing', 'technical', 'general']),
      );
    });

    it('harus memanggil generateContent tepat satu kali per pemanggilan (cache miss)', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Balasan.',
        }),
      });

      await service.analyzeAndDraftReply('Subjek', 'Pesan');

      expect(generateContentMock).toHaveBeenCalledTimes(1);
    });

    it('harus memanggil cacheService.set setelah mendapatkan hasil dari Gemini', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'billing',
          suggestedReply: 'Balasan tagihan.',
        }),
      });

      await service.analyzeAndDraftReply('Tagihan', 'Saya ingin bertanya soal tagihan');

      // set dipanggil dengan argumen yang sesuai
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        'Tagihan',
        'Saya ingin bertanya soal tagihan',
        expect.objectContaining({ category: 'billing' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Redis Cache – hit & miss
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – Redis Cache', () => {
    it('harus mengembalikan hasil dari cache dan TIDAK memanggil Gemini jika cache hit', async () => {
      const cachedResult = Object.assign(new LlmAnalysisResultDto(), {
        category: 'billing',
        suggestedReply: 'Dari cache.',
      });
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const result = await service.analyzeAndDraftReply(
        'Subjek Sama',
        'Pesan Sama',
      );

      expect(result).toEqual(cachedResult);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('harus memanggil Gemini dan simpan ke cache saat cache miss', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: 'Tim teknis kami segera membantu.',
        }),
      });

      await service.analyzeAndDraftReply('Bug login', 'App tidak bisa dibuka');

      expect(generateContentMock).toHaveBeenCalledOnce();
      expect(cacheServiceMock.set).toHaveBeenCalledOnce();
    });

    it('harus tetap berjalan normal jika cacheService.get melempar error (graceful degrade)', async () => {
      cacheServiceMock.get.mockRejectedValue(new Error('Redis connection refused'));
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Terima kasih.',
        }),
      });

      // Tidak boleh throw — harus graceful
      const result = await service.analyzeAndDraftReply('Subjek', 'Pesan');

      expect(result).toBeInstanceOf(LlmAnalysisResultDto);
    });

    it('harus tetap mengembalikan hasil meski cacheService.set melempar error', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      cacheServiceMock.set.mockRejectedValue(new Error('Redis write failed'));
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Terima kasih.',
        }),
      });

      const result = await service.analyzeAndDraftReply('Subjek', 'Pesan');

      expect(result).toBeInstanceOf(LlmAnalysisResultDto);
    });
  });

  // -------------------------------------------------------------------------
  // 4. analyzeAndDraftReply – error dari Gemini API
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – error dari Gemini API', () => {
    it('harus melempar BadGatewayException ketika response.text adalah string kosong', async () => {
      generateContentMock.mockResolvedValue({ text: '' });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('harus melempar BadGatewayException ketika response.text adalah null', async () => {
      generateContentMock.mockResolvedValue({ text: null });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('harus melempar BadGatewayException ketika response.text adalah undefined', async () => {
      generateContentMock.mockResolvedValue({ text: undefined });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('pesan BadGatewayException harus menyebutkan safety filter', async () => {
      generateContentMock.mockResolvedValue({ text: '' });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow('safety filter');
    });

    it('harus meneruskan error jika generateContent melempar exception', async () => {
      generateContentMock.mockRejectedValue(new Error('Network error'));

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // 5. analyzeAndDraftReply – error parsing JSON
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – error parsing JSON', () => {
    it('harus melempar InternalServerErrorException ketika respon bukan JSON valid', async () => {
      generateContentMock.mockResolvedValue({ text: 'bukan-json' });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika respon JSON malformed', async () => {
      generateContentMock.mockResolvedValue({ text: '{"category": "Auth"' });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('pesan InternalServerErrorException harus menyebutkan JSON tidak valid', async () => {
      generateContentMock.mockResolvedValue({ text: 'bukan-json' });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow('JSON');
    });
  });

  // -------------------------------------------------------------------------
  // 6. analyzeAndDraftReply – error validasi DTO
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – error validasi DTO', () => {
    it('harus melempar InternalServerErrorException ketika field "suggestedReply" tidak ada', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({ category: 'technical' }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika field "category" tidak ada', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({ suggestedReply: 'Balasan.' }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika kedua field tidak ada (objek kosong)', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({}),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika ada field asing (forbidNonWhitelisted)', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: 'Balasan.',
          extraField: 'tidak diharapkan',
        }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika "category" adalah string kosong', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: '',
          suggestedReply: 'Balasan.',
        }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika "category" bukan salah satu dari billing/technical/general', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'authentication',
          suggestedReply: 'Balasan.',
        }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('harus melempar InternalServerErrorException ketika "suggestedReply" adalah string kosong', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: '',
        }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('pesan InternalServerErrorException harus menyebutkan skema DTO', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({ category: 'technical' }),
      });

      await expect(
        service.analyzeAndDraftReply('Subjek', 'Pesan'),
      ).rejects.toThrow('skema DTO');
    });
  });

  // -------------------------------------------------------------------------
  // 7. analyzeAndDraftReply – variasi input
  // -------------------------------------------------------------------------
  describe('analyzeAndDraftReply – variasi input', () => {
    it('harus berhasil dengan subject dan message yang sangat panjang', async () => {
      const longText = 'A'.repeat(1000);
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'general',
          suggestedReply: 'Terima kasih.',
        }),
      });

      const result = await service.analyzeAndDraftReply(longText, longText);
      expect(result).toBeInstanceOf(LlmAnalysisResultDto);
    });

    it('harus berhasil dengan subject dan message yang mengandung karakter spesial', async () => {
      generateContentMock.mockResolvedValue({
        text: JSON.stringify({
          category: 'technical',
          suggestedReply: 'Kami akan menyelidikinya.',
        }),
      });

      const result = await service.analyzeAndDraftReply(
        'Masalah <script>alert("xss")</script>',
        'Tolong & bantu saya! "URGENT"',
      );

      expect(result).toBeInstanceOf(LlmAnalysisResultDto);
    });
  });
});
