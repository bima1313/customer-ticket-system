import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { LlmAnalysisResultDto } from './dto/llm-analysis-result.dto.js';
import { LlmCacheService } from './cache/llm-cache.service.js';

/**
 * Prompt tunggal (combined) yang dipakai untuk klasifikasi kategori
 * sekaligus pembuatan draft balasan.
 *
 * Contoh prompt yang dikirim ke Gemini:
 * ---
 * Kamu adalah agen customer support profesional. Tugasmu adalah menganalisis
 * tiket dari pelanggan dan menghasilkan dua hal:
 *
 * 1. category — Klasifikasikan tiket ke dalam TEPAT SATU kategori berikut:
 *    - "billing"   : terkait pembayaran, tagihan, invoice, harga, langganan, refund
 *    - "technical" : terkait bug, error, gangguan teknis, performa, integrasi, API
 *    - "general"   : pertanyaan umum, informasi produk, atau topik lain yang tidak masuk dua kategori di atas
 *
 * 2. suggestedReply — Tulis draft balasan singkat (2-4 kalimat) yang sopan dan
 *    profesional dalam bahasa yang sama dengan pesan pelanggan. Balasan harus
 *    memperlihatkan empati dan memberi gambaran langkah selanjutnya.
 *
 * Subjek: <subject>
 * Pesan: <message>
 * ---
 */
const buildPrompt = (subject: string, message: string): string => `\
Kamu adalah agen customer support profesional. Tugasmu adalah menganalisis \
tiket dari pelanggan dan menghasilkan dua hal:

1. category — Klasifikasikan tiket ke dalam TEPAT SATU kategori berikut:
   - "billing"   : terkait pembayaran, tagihan, invoice, harga, langganan, refund
   - "technical" : terkait bug, error, gangguan teknis, performa, integrasi, API
   - "general"   : pertanyaan umum, informasi produk, atau topik lain yang tidak masuk dua kategori di atas

2. suggestedReply — Tulis draft balasan singkat (2-4 kalimat) yang sopan dan \
profesional dalam bahasa yang sama dengan pesan pelanggan. Balasan harus \
memperlihatkan empati dan memberi gambaran langkah selanjutnya.

Subjek: ${subject}
Pesan: ${message}`;

@Injectable()
export class LlmService {
  private readonly ai: GoogleGenAI;
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: LlmCacheService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY tidak diset.');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeAndDraftReply(
    subject: string,
    message: string,
  ): Promise<LlmAnalysisResultDto> {
    // 1. Cek cache terlebih dahulu
    try {
      const cached = await this.cacheService.get(subject, message);
      if (cached) {
        this.logger.log('Menggunakan hasil LLM dari cache Redis.');
        return cached;
      }
    } catch (err) {
      this.logger.warn(
        `Redis GET error, melanjutkan tanpa cache: ${(err as Error).message}`,
      );
    }

    // 2. Panggil Gemini API
    this.logger.log('Cache miss — memanggil Gemini API.');
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: buildPrompt(subject, message),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              // Enum di schema memastikan Gemini hanya mengembalikan salah satu dari 3 nilai
              enum: ['billing', 'technical', 'general'],
            },
            suggestedReply: { type: Type.STRING },
          },
          required: ['category', 'suggestedReply'],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new BadGatewayException(
        'Gemini API tidak mengembalikan teks respon (mungkin terblokir safety filter).',
      );
    }

    let parsedObject: Record<string, unknown>;
    try {
      parsedObject = JSON.parse(rawText);
    } catch {
      throw new InternalServerErrorException(
        'Respon dari Gemini bukan JSON valid.',
      );
    }

    const dtoInstance = plainToInstance(LlmAnalysisResultDto, parsedObject);

    try {
      await validateOrReject(dtoInstance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
    } catch {
      throw new InternalServerErrorException(
        'Output LLM tidak memenuhi skema DTO yang diharapkan.',
      );
    }

    // 3. Simpan hasil ke cache (fire-and-forget, error ditangani di dalam cacheService)
    void this.cacheService.set(subject, message, dtoInstance);

    return dtoInstance;
  }
}
