const crypto = require('crypto')
const express = require('express')
const morgan = require('morgan')
const { init: initDB, Application } = require('./db')

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(morgan('tiny'))

function getOpenId(req) {
  return req.headers['x-wx-openid'] || ''
}

function createApplicationNo() {
  const date = new Date()
  const dateText = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('')

  const randomText = crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()

  return `SQ${dateText}${randomText}`
}

function encryptIdCard(value) {
  const keyText = process.env.DATA_ENCRYPTION_KEY || ''

  if (!/^[0-9a-fA-F]{64}$/.test(keyText)) {
    throw new Error('DATA_ENCRYPTION_KEY配置错误')
  }

  const key = Buffer.from(keyText, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex')
  ].join('.')
}

app.get('/', (req, res) => {
  res.send({
    code: 0,
    message: 'service running'
  })
})

app.get('/api/health', (req, res) => {
  res.send({
    code: 0,
    message: 'ok'
  })
})

app.post('/api/applications', async (req, res) => {
  try {
    const openid = getOpenId(req)

    if (!openid) {
      return res.status(401).send({
        code: 401,
        message: '无法识别当前微信用户'
      })
    }

    const {
      name = '',
      phone = '',
      idCard = '',
      school = '',
      screenshotPath = '',
      noLicenseDeclared = false,
      privacyAgreed = false
    } = req.body || {}

    const cleanName = String(name).trim()
    const cleanPhone = String(phone).trim()
    const cleanIdCard = String(idCard).trim()
    const cleanSchool = String(school).trim()
    const cleanScreenshotPath = String(screenshotPath).trim()

    if (!cleanName || cleanName.length > 50) {
      return res.status(400).send({
        code: 400,
        message: '姓名格式不正确'
      })
    }

    if (!/^1\d{10}$/.test(cleanPhone)) {
      return res.status(400).send({
        code: 400,
        message: '手机号格式不正确'
      })
    }

    if (!/^\d{17}[\dXx]$/.test(cleanIdCard)) {
      return res.status(400).send({
        code: 400,
        message: '身份证号必须为18位'
      })
    }

    const birthYear = Number(cleanIdCard.slice(6, 10))

    if (birthYear < 2004 || birthYear > 2008) {
      return res.status(400).send({
        code: 400,
        message: '出生年份必须为2004至2008年'
      })
    }

    if (!cleanSchool || cleanSchool.length > 100) {
      return res.status(400).send({
        code: 400,
        message: '学校名称格式不正确'
      })
    }

    if (!cleanScreenshotPath) {
      return res.status(400).send({
        code: 400,
        message: '请上传学籍凭证'
      })
    }

    if (noLicenseDeclared !== true) {
      return res.status(400).send({
        code: 400,
        message: '请确认当前未报名申领驾驶证'
      })
    }

    if (privacyAgreed !== true) {
      return res.status(400).send({
        code: 400,
        message: '请阅读并同意隐私说明'
      })
    }

    const existing = await Application.findOne({
      where: { openid }
    })

    if (existing) {
      return res.status(409).send({
        code: 409,
        message: '当前微信已有申请记录',
        data: {
          applicationNo: existing.applicationNo
        }
      })
    }

    const application = await Application.create({
      applicationNo: createApplicationNo(),
      openid,
      name: cleanName,
      phone: cleanPhone,
      idCardCiphertext: encryptIdCard(cleanIdCard),
      idCardLast4: cleanIdCard.slice(-4),
      birthYear,
      school: cleanSchool,
      screenshotPath: cleanScreenshotPath,
      status: 'pending'
    })

    return res.status(201).send({
      code: 0,
      message: '申请提交成功',
      data: {
        applicationNo: application.applicationNo,
        status: application.status,
        createdAt: application.createdAt
      }
    })
  } catch (error) {
    console.error('创建申请失败：', error.message)

    return res.status(500).send({
      code: 500,
      message: '服务器处理失败'
    })
  }
})

app.get('/api/applications/me', async (req, res) => {
  try {
    const openid = getOpenId(req)

    if (!openid) {
      return res.status(401).send({
        code: 401,
        message: '无法识别当前微信用户'
      })
    }

    const application = await Application.findOne({
      where: { openid },
      order: [['createdAt', 'DESC']]
    })

    if (
      application &&
      application.status === 'pending' &&
      application.birthYear >= 2004 &&
      application.birthYear <= 2008 &&
      Date.now() - new Date(application.createdAt).getTime() >= 30 * 1000
    ) {
      await application.update({
        status: 'approved',
        reviewNote: '系统资格校验通过'
      })
    }

    return res.send({
      code: 0,
      data: application
        ? {
            applicationNo: application.applicationNo,
            school: application.school,
            status: application.status,
            reviewNote: application.reviewNote,
            createdAt: application.createdAt,
            updatedAt: application.updatedAt,
            redeemedAt: application.redeemedAt
          }
        : null
    })
  } catch (error) {
    console.error('查询申请失败：', error.message)

    return res.status(500).send({
      code: 500,
      message: '服务器处理失败'
    })
  }
})

const port = process.env.PORT || 80

async function bootstrap() {
  await initDB()

  app.listen(port, () => {
    console.log(`服务已启动，端口：${port}`)
  })
}

bootstrap().catch((error) => {
  console.error('服务启动失败：', error.message)
  process.exit(1)
})